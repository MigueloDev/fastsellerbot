import { prisma } from './client.js'
import { applyMovementsInTx, assertAvailableInTx, StockError } from './stock.js'
import { pickTierPrice, qtyByProduct } from '../sales/pricing.js'
import { round2 } from '../sales/balance.js'
import { totalUsdOf } from '../deliveryNotes/totals.js'

export class DeliveryNoteError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'DeliveryNoteError'
    this.status = status
  }
}

const NOTE_INCLUDE = {
  customer: true,
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, active: true } },
      variant: { select: { id: true, name: true, sku: true, active: true } },
    },
  },
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

function serializeNote(row) {
  if (!row) return null
  return {
    ...row,
    totalUsd: toNum(row.totalUsd),
    items: (row.items ?? []).map((it) => ({
      ...it,
      unitPriceUsd: toNum(it.unitPriceUsd),
      subtotalUsd: toNum(it.subtotalUsd),
    })),
  }
}

/**
 * @param {any} tx
 * @param {Array<{productId:string, variantId?:string|null, quantity:number, unitPriceUsd?:number}>} items
 */
async function resolveItems(tx, items) {
  const totalsByProduct = qtyByProduct(items)
  const resolved = []
  for (const raw of items) {
    const quantity = raw.quantity
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new DeliveryNoteError(422, 'quantity debe ser entero ≥ 1')
    }
    const productId = raw.productId
    const variantId = raw.variantId ?? null
    if (!productId) throw new DeliveryNoteError(422, 'productId es requerido')

    const product = await tx.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
        prices: { where: { active: true } },
      },
    })
    if (!product || !product.active) {
      throw new DeliveryNoteError(422, `Producto no encontrado o inactivo: ${productId}`)
    }

    const activeVariants = product.variants.filter((v) => v.active)
    if (activeVariants.length > 0) {
      if (!variantId) {
        throw new DeliveryNoteError(422, 'variantId es requerido para productos con variantes')
      }
      const variant = activeVariants.find((v) => v.id === variantId)
      if (!variant) throw new DeliveryNoteError(422, 'Variante no encontrada o inactiva')
    } else if (variantId) {
      throw new DeliveryNoteError(422, 'variantId debe ser null para productos sin variantes')
    }

    let unitPriceUsd
    if (raw.unitPriceUsd != null) {
      const override = Number(raw.unitPriceUsd)
      if (!Number.isFinite(override) || !(override > 0)) {
        throw new DeliveryNoteError(422, 'unitPriceUsd debe ser > 0')
      }
      unitPriceUsd = round2(override)
    } else {
      // Snapshot auditoría: DETAL (REF_USD) por defecto cuando no muestran valor.
      const tierQty = totalsByProduct.get(productId) ?? quantity
      const amount =
        pickTierPrice(product.prices, 'REF_USD', tierQty) ??
        pickTierPrice(product.prices, 'REF_BS', tierQty)
      if (amount == null) {
        throw new DeliveryNoteError(422, `Sin precio para ${product.name}`)
      }
      unitPriceUsd = round2(amount)
    }

    const subtotalUsd = round2(unitPriceUsd * quantity)
    resolved.push({ productId, variantId, quantity, unitPriceUsd, subtotalUsd })
  }
  return resolved
}

/**
 * @param {{ customerId: string, showValue?: boolean, items: Array<{productId:string, variantId?:string|null, quantity:number, unitPriceUsd?:number}>, note?: string|null, agentName?: string|null }} input
 */
export async function createDeliveryNote(input) {
  const {
    customerId,
    showValue = true,
    items,
    note = null,
    agentName = null,
  } = input

  if (!customerId) throw new DeliveryNoteError(422, 'customerId es requerido')
  if (!Array.isArray(items) || items.length < 1) {
    throw new DeliveryNoteError(422, 'La nota requiere al menos un ítem')
  }
  if (items.length > 50) {
    throw new DeliveryNoteError(422, 'Máximo 50 ítems por nota')
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } })
      if (!customer || !customer.active) {
        throw new DeliveryNoteError(422, 'Cliente no encontrado o inactivo')
      }

      const resolved = await resolveItems(tx, items)
      const totalUsd = totalUsdOf(resolved)

      await assertAvailableInTx(tx, resolved)

      const row = await tx.deliveryNote.create({
        data: {
          customerId,
          showValue: Boolean(showValue),
          totalUsd,
          note: note?.trim() || null,
          agentName,
          status: 'ACTIVA',
          items: {
            create: resolved.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              quantity: it.quantity,
              unitPriceUsd: it.unitPriceUsd,
              subtotalUsd: it.subtotalUsd,
            })),
          },
        },
      })

      await applyMovementsInTx(
        tx,
        resolved.map((it) => ({
          productId: it.productId,
          variantId: it.variantId,
          type: 'SALIDA',
          quantity: it.quantity,
          deliveryNoteId: row.id,
          note: `nota entrega #${row.number}`,
        })),
        { agentName },
      )

      return tx.deliveryNote.findUnique({
        where: { id: row.id },
        include: NOTE_INCLUDE,
      })
    })

    return serializeNote(created)
  } catch (err) {
    if (err instanceof DeliveryNoteError || err instanceof StockError) throw err
    throw err
  }
}

/**
 * @param {string} id
 * @param {{ agentName?: string|null }} opts
 */
export async function voidDeliveryNote(id, { agentName = null } = {}) {
  const note = await prisma.$transaction(async (tx) => {
    const current = await tx.deliveryNote.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!current) throw new DeliveryNoteError(404, 'Nota de entrega no encontrada')
    if (current.status === 'ANULADA') {
      throw new DeliveryNoteError(409, 'La nota ya está anulada')
    }

    await applyMovementsInTx(
      tx,
      current.items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        type: 'ENTRADA',
        quantity: it.quantity,
        deliveryNoteId: current.id,
        note: `anulación nota entrega #${current.number}`,
      })),
      { agentName },
    )

    return tx.deliveryNote.update({
      where: { id },
      data: {
        status: 'ANULADA',
        voidedAt: new Date(),
        voidedBy: agentName,
      },
      include: NOTE_INCLUDE,
    })
  })

  return serializeNote(note)
}

export async function findDeliveryNote(id) {
  const note = await prisma.deliveryNote.findUnique({
    where: { id },
    include: NOTE_INCLUDE,
  })
  return serializeNote(note)
}

/**
 * @param {{ status?: string, customerId?: string, from?: string, to?: string, limit?: number, offset?: number }} filters
 */
export async function listDeliveryNotes({
  status,
  customerId,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const skip = Math.max(Number(offset) || 0, 0)

  /** @type {Record<string, unknown>} */
  const where = {}
  if (status) where.status = status
  if (customerId) where.customerId = customerId
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    prisma.deliveryNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: NOTE_INCLUDE,
    }),
    prisma.deliveryNote.count({ where }),
  ])

  return {
    items: items.map(serializeNote),
    total,
    limit: take,
    offset: skip,
  }
}

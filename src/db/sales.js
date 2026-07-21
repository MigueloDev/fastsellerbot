import { prisma } from './client.js'
import { applyMovementsInTx, StockError } from './stock.js'
import { currencyFor, PAYMENT_METHODS } from '../sales/paymentMethods.js'
import { balanceUsdOf, isSettled, round2, PAYMENT_TOLERANCE } from '../sales/balance.js'
import { readRate } from '../rates/store.js'

export class SaleError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'SaleError'
    this.status = status
  }
}

const SALE_INCLUDE = {
  customer: true,
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, active: true } },
      variant: { select: { id: true, name: true, sku: true, active: true } },
    },
  },
  payments: { orderBy: { paidAt: 'asc' } },
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

function serializeSale(row) {
  if (!row) return null
  return {
    ...row,
    totalUsd: toNum(row.totalUsd),
    items: (row.items ?? []).map((it) => ({
      ...it,
      unitPriceUsd: toNum(it.unitPriceUsd),
      subtotalUsd: toNum(it.subtotalUsd),
    })),
    payments: (row.payments ?? []).map((p) => ({
      ...p,
      amount: toNum(p.amount),
      amountUsd: toNum(p.amountUsd),
      rateUsed: p.rateUsed != null ? toNum(p.rateUsed) : null,
    })),
  }
}

/**
 * @param {{ customerId: string, priceRef: 'REF_USD'|'REF_BS', items: Array<{productId:string, variantId?:string|null, quantity:number}>, note?: string|null, agentName?: string|null }} input
 */
export async function createSale(input) {
  const { customerId, priceRef, items, note = null, agentName = null } = input

  if (!customerId) throw new SaleError(422, 'customerId es requerido')
  if (!['REF_USD', 'REF_BS'].includes(priceRef)) {
    throw new SaleError(422, 'priceRef inválido')
  }
  if (!Array.isArray(items) || items.length < 1) {
    throw new SaleError(422, 'La venta requiere al menos un ítem')
  }

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } })
      if (!customer || !customer.active) {
        throw new SaleError(422, 'Cliente no encontrado o inactivo')
      }

      const resolved = []
      for (const raw of items) {
        const quantity = raw.quantity
        if (!Number.isInteger(quantity) || quantity < 1) {
          throw new SaleError(422, 'quantity debe ser entero ≥ 1')
        }
        const productId = raw.productId
        const variantId = raw.variantId ?? null
        if (!productId) throw new SaleError(422, 'productId es requerido')

        const product = await tx.product.findUnique({
          where: { id: productId },
          include: {
            variants: true,
            prices: { where: { active: true } },
          },
        })
        if (!product || !product.active) {
          throw new SaleError(422, `Producto no encontrado o inactivo: ${productId}`)
        }

        const activeVariants = product.variants.filter((v) => v.active)
        if (activeVariants.length > 0) {
          if (!variantId) {
            throw new SaleError(422, 'variantId es requerido para productos con variantes')
          }
          const variant = activeVariants.find((v) => v.id === variantId)
          if (!variant) throw new SaleError(422, 'Variante no encontrada o inactiva')
        } else if (variantId) {
          throw new SaleError(422, 'variantId debe ser null para productos sin variantes')
        }

        // ponytail: minQty tiers dormidos — siempre precio activo minQty=1
        const price = product.prices.find((p) => p.ref === priceRef && p.minQty === 1)
          ?? product.prices.find((p) => p.ref === priceRef)
        if (!price) {
          throw new SaleError(422, `Sin precio ${priceRef} para ${product.name}`)
        }

        const unitPriceUsd = round2(toNum(price.amount))
        const subtotalUsd = round2(unitPriceUsd * quantity)
        resolved.push({ productId, variantId, quantity, unitPriceUsd, subtotalUsd })
      }

      const totalUsd = round2(resolved.reduce((s, it) => s + it.subtotalUsd, 0))

      const created = await tx.sale.create({
        data: {
          customerId,
          priceRef,
          totalUsd,
          note: note?.trim() || null,
          agentName,
          status: 'PENDIENTE',
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
          saleId: created.id,
          note: `venta ${created.id}`,
        })),
        { agentName },
      )

      return tx.sale.findUnique({
        where: { id: created.id },
        include: SALE_INCLUDE,
      })
    })

    return serializeSale(sale)
  } catch (err) {
    if (err instanceof SaleError || err instanceof StockError) throw err
    throw err
  }
}

/**
 * @param {string} saleId
 * @param {{ method: string, amount: number, note?: string|null, agentName?: string|null }} input
 */
export async function addPayment(saleId, input) {
  const { method, amount, note = null, agentName = null } = input

  if (!PAYMENT_METHODS[method]) throw new SaleError(422, `Método inválido: ${method}`)
  if (typeof amount !== 'number' || !(amount > 0)) {
    throw new SaleError(422, 'amount debe ser > 0')
  }

  const currency = currencyFor(method)
  // Snapshot BCV on every payment (audit); BS conversion uses same quote.
  // Live balanceBs still comes from readRate in balanceView, not this snapshot.
  const quote = await readRate('BCV')
  if (!quote || !(quote.rate > 0)) {
    throw new SaleError(
      503,
      'No hay tasa BCV disponible. Espere a que corra el job de tasas o configure el fetch.',
    )
  }
  const rateUsed = quote.rate
  const rateSource = 'BCV'
  const amountUsd =
    currency === 'BS' ? round2(amount / rateUsed) : round2(amount)

  const sale = await prisma.$transaction(async (tx) => {
    const current = await tx.sale.findUnique({
      where: { id: saleId },
      include: { payments: true },
    })
    if (!current) throw new SaleError(404, 'Venta no encontrada')
    if (current.status === 'ANULADA') throw new SaleError(422, 'Venta anulada')
    if (current.status === 'PAGADA') throw new SaleError(422, 'Venta ya está pagada')

    const balance = balanceUsdOf(serializeSale(current))
    if (amountUsd - balance > PAYMENT_TOLERANCE) {
      throw new SaleError(
        422,
        `Pago excede el saldo (saldo $${balance.toFixed(2)}, pago $${amountUsd.toFixed(2)})`,
      )
    }

    await tx.payment.create({
      data: {
        saleId,
        method,
        currency,
        amount: round2(amount),
        amountUsd,
        rateUsed,
        rateSource,
        note: note?.trim() || null,
        agentName,
      },
    })

    const withPayments = await tx.sale.findUnique({
      where: { id: saleId },
      include: SALE_INCLUDE,
    })
    const remaining = balanceUsdOf(serializeSale(withPayments))
    if (isSettled(remaining)) {
      return tx.sale.update({
        where: { id: saleId },
        data: { status: 'PAGADA' },
        include: SALE_INCLUDE,
      })
    }
    return withPayments
  })

  return serializeSale(sale)
}

/**
 * @param {string} saleId
 * @param {{ agentName?: string|null }} opts
 */
export async function voidSale(saleId, { agentName = null } = {}) {
  const sale = await prisma.$transaction(async (tx) => {
    const current = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    })
    if (!current) throw new SaleError(404, 'Venta no encontrada')
    if (current.status === 'ANULADA') throw new SaleError(422, 'Venta ya anulada')
    if (current.payments.length > 0) {
      throw new SaleError(
        409,
        'No se puede anular una venta con pagos. Gestione la devolución fuera del sistema y anote en note.',
      )
    }

    await applyMovementsInTx(
      tx,
      current.items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        type: 'ENTRADA',
        quantity: it.quantity,
        saleId: current.id,
        note: `anulación venta ${current.id}`,
      })),
      { agentName },
    )

    return tx.sale.update({
      where: { id: saleId },
      data: { status: 'ANULADA' },
      include: SALE_INCLUDE,
    })
  })

  return serializeSale(sale)
}

export async function findSale(id) {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: SALE_INCLUDE,
  })
  return serializeSale(sale)
}

/**
 * @param {{ status?: string, customerId?: string, from?: string, to?: string, limit?: number, offset?: number }} filters
 */
export async function listSales({
  status,
  customerId,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const skip = Math.max(Number(offset) || 0, 0)
  const where = {}
  if (status) where.status = status
  if (customerId) where.customerId = customerId
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: SALE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.sale.count({ where }),
  ])

  return {
    items: items.map(serializeSale),
    total,
    limit: take,
    offset: skip,
  }
}

/** Ventas PENDIENTE ordenadas por antigüedad (deuda vieja primero). */
export async function listReceivables() {
  const sales = await prisma.sale.findMany({
    where: { status: 'PENDIENTE' },
    include: SALE_INCLUDE,
    orderBy: { createdAt: 'asc' },
  })
  return sales.map(serializeSale)
}

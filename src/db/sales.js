import { prisma } from './client.js'
import { applyMovementsInTx, assertAvailableInTx, StockError } from './stock.js'
import { currencyFor, PAYMENT_METHODS } from '../sales/paymentMethods.js'
import { resolvePaymentQuote } from '../sales/paymentRate.js'
import {
  balanceUsdOf,
  isSettled,
  round2,
  settleCreditUsd,
  PAYMENT_TOLERANCE,
} from '../sales/balance.js'
import { pickTierPrice, qtyByProduct } from '../sales/pricing.js'
import { saleProfitOf } from '../sales/profit.js'
import { readRate } from '../rates/store.js'
import { getRateById } from './rates.js'
import { stampClosingProfitIfNeeded } from './currencyPurchases.js'
import { applyCashMovementInTx } from '../cash/apply.js'
import { assertAccountForPayment } from '../cash/movement.js'

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
  const items = (row.items ?? []).map((it) => ({
    ...it,
    unitPriceUsd: toNum(it.unitPriceUsd),
    unitCostUsd: it.unitCostUsd != null ? toNum(it.unitCostUsd) : null,
    subtotalUsd: toNum(it.subtotalUsd),
  }))
  const base = {
    ...row,
    totalUsd: toNum(row.totalUsd),
    items,
    payments: (row.payments ?? []).map((p) => {
      const { receiptPath, ...rest } = p
      return {
        ...rest,
        amount: toNum(p.amount),
        amountUsd: toNum(p.amountUsd),
        rateUsed: p.rateUsed != null ? toNum(p.rateUsed) : null,
        hasReceipt: Boolean(receiptPath),
      }
    }),
  }
  return {
    ...base,
    ...saleProfitOf(base),
  }
}

/**
 * @param {any} tx
 * @param {'REF_USD'|'REF_BS'} priceRef
 * @param {Array<{productId:string, variantId?:string|null, quantity:number, unitPriceUsd?:number}>} items
 */
async function resolveSaleItems(tx, priceRef, items) {
  const totalsByProduct = qtyByProduct(items)
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

    let unitPriceUsd
    if (raw.unitPriceUsd != null) {
      const override = Number(raw.unitPriceUsd)
      if (!Number.isFinite(override) || !(override > 0)) {
        throw new SaleError(422, 'unitPriceUsd debe ser > 0')
      }
      unitPriceUsd = round2(override)
    } else {
      const tierQty = totalsByProduct.get(productId) ?? quantity
      const amount = pickTierPrice(product.prices, priceRef, tierQty)
      if (amount == null) {
        throw new SaleError(422, `Sin precio ${priceRef} para ${product.name}`)
      }
      unitPriceUsd = round2(amount)
    }

    const purchaseCost = toNum(product.purchasePriceUsd)
    if (purchaseCost == null || !(purchaseCost > 0)) {
      throw new SaleError(
        422,
        `Producto sin precio de compra: ${product.name}. Edite el producto y asigne purchasePriceUsd.`,
      )
    }
    const unitCostUsd = round2(purchaseCost)

    const subtotalUsd = round2(unitPriceUsd * quantity)
    resolved.push({ productId, variantId, quantity, unitPriceUsd, unitCostUsd, subtotalUsd })
  }
  return resolved
}

function assertSaleInput({ customerId, priceRef, items }) {
  if (!customerId) throw new SaleError(422, 'customerId es requerido')
  if (!['REF_USD', 'REF_BS'].includes(priceRef)) {
    throw new SaleError(422, 'priceRef inválido')
  }
  if (!Array.isArray(items) || items.length < 1) {
    throw new SaleError(422, 'La venta requiere al menos un ítem')
  }
}

/**
 * @param {{ customerId: string, priceRef: 'REF_USD'|'REF_BS', items: Array<{productId:string, variantId?:string|null, quantity:number, unitPriceUsd?:number}>, note?: string|null, agentName?: string|null, sellerId?: string|null }} input
 */
export async function createSale(input) {
  const { customerId, priceRef, items, note = null, agentName = null, sellerId = null } = input
  assertSaleInput({ customerId, priceRef, items })

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } })
      if (!customer || !customer.active) {
        throw new SaleError(422, 'Cliente no encontrado o inactivo')
      }

      const resolved = await resolveSaleItems(tx, priceRef, items)
      const totalUsd = round2(resolved.reduce((s, it) => s + it.subtotalUsd, 0))

      // La venta reserva, no descuenta: el SALIDA se escribe al entregar.
      await assertAvailableInTx(tx, resolved)

      const created = await tx.sale.create({
        data: {
          customerId,
          priceRef,
          totalUsd,
          note: note?.trim() || null,
          agentName,
          sellerId,
          status: 'PENDIENTE',
          items: {
            create: resolved.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              quantity: it.quantity,
              unitPriceUsd: it.unitPriceUsd,
              unitCostUsd: it.unitCostUsd,
              subtotalUsd: it.subtotalUsd,
            })),
          },
        },
      })

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
 * Corrige venta PENDIENTE, sin pagos y sin entregar. Solo cambia la reserva:
 * no hay movimientos que reescribir porque el stock aún no salió.
 * @param {string} saleId
 * @param {{ customerId: string, priceRef: 'REF_USD'|'REF_BS', items: Array<{productId:string, variantId?:string|null, quantity:number, unitPriceUsd?:number}>, note?: string|null, agentName?: string|null }} input
 */
export async function updateSale(saleId, input) {
  const { customerId, priceRef, items, note = null } = input
  assertSaleInput({ customerId, priceRef, items })

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const current = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true, payments: true },
      })
      if (!current) throw new SaleError(404, 'Venta no encontrada')
      if (current.status === 'ANULADA') throw new SaleError(422, 'Venta anulada')
      if (current.status !== 'PENDIENTE') {
        throw new SaleError(422, 'Solo se puede editar una venta pendiente')
      }
      if (current.payments.length > 0) {
        throw new SaleError(
          409,
          'No se puede editar una venta con pagos. Gestione la devolución fuera del sistema y anote en note.',
        )
      }
      if (current.deliveryStatus === 'ENTREGADA') {
        throw new SaleError(
          409,
          'No se puede editar una venta ya entregada. Revierta la entrega primero.',
        )
      }

      const customer = await tx.customer.findUnique({ where: { id: customerId } })
      if (!customer || !customer.active) {
        throw new SaleError(422, 'Cliente no encontrado o inactivo')
      }

      const resolved = await resolveSaleItems(tx, priceRef, items)
      const totalUsd = round2(resolved.reduce((s, it) => s + it.subtotalUsd, 0))

      // La reserva vieja de esta misma venta no cuenta contra la nueva
      await assertAvailableInTx(tx, resolved, { excludeSaleId: saleId })

      await tx.saleItem.deleteMany({ where: { saleId } })
      await tx.sale.update({
        where: { id: saleId },
        data: {
          customerId,
          priceRef,
          totalUsd,
          note: note?.trim() || null,
          items: {
            create: resolved.map((it) => ({
              productId: it.productId,
              variantId: it.variantId,
              quantity: it.quantity,
              unitPriceUsd: it.unitPriceUsd,
              unitCostUsd: it.unitCostUsd,
              subtotalUsd: it.subtotalUsd,
            })),
          },
        },
      })

      return tx.sale.findUnique({
        where: { id: saleId },
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
 * @param {{
 *   method: string,
 *   amount: number,
 *   note?: string|null,
 *   agentName?: string|null,
 *   receiptPath?: string|null,
 *   rateId?: string|null,
 *   accountId: string,
 * }} input
 */
export async function addPayment(saleId, input) {
  const {
    method,
    amount,
    note = null,
    agentName = null,
    receiptPath = null,
    rateId = null,
    accountId,
  } = input

  if (!PAYMENT_METHODS[method]) throw new SaleError(422, `Método inválido: ${method}`)
  if (typeof amount !== 'number' || !(amount > 0)) {
    throw new SaleError(422, 'amount debe ser > 0')
  }
  if (!accountId) throw new SaleError(422, 'accountId es requerido')

  const currency = currencyFor(method)
  // Snapshot BCV on every payment (audit); BS conversion uses same quote.
  // Live balanceBs still comes from readRate in balanceView, not this snapshot.
  // rateId permite fijar una tasa histórica (p. ej. pago de ayer cargado hoy).
  const resolvedQuote = await resolvePaymentQuote(rateId, {
    getById: getRateById,
    readLive: () => readRate('BCV'),
  })
  if (resolvedQuote.error) {
    throw new SaleError(resolvedQuote.error.status, resolvedQuote.error.message)
  }
  const rateUsed = round2(resolvedQuote.quote.rate)
  const rateSource = 'BCV'
  const rawAmountUsd =
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
    if (rawAmountUsd - balance > PAYMENT_TOLERANCE) {
      throw new SaleError(
        422,
        `Pago excede el saldo (saldo $${balance.toFixed(2)}, pago $${rawAmountUsd.toFixed(2)})`,
      )
    }
    // ponytail: absorbe ≤$0.10 de redondeo Bs→USD para libro en $0 exacto
    const amountUsd = settleCreditUsd(rawAmountUsd, balance)

    const account = await tx.cashAccount.findUnique({ where: { id: accountId } })
    assertAccountForPayment(account, currency)

    const payment = await tx.payment.create({
      data: {
        saleId,
        accountId,
        method,
        currency,
        amount: round2(amount),
        amountUsd,
        rateUsed,
        rateSource,
        note: note?.trim() || null,
        agentName,
        receiptPath: receiptPath || null,
      },
    })

    await applyCashMovementInTx(tx, {
      accountId,
      type: 'ENTRADA',
      amount: round2(amount),
      note: note?.trim() || null,
      agentName,
      paymentId: payment.id,
    })

    const withPayments = await tx.sale.findUnique({
      where: { id: saleId },
      include: SALE_INCLUDE,
    })
    const remaining = balanceUsdOf(serializeSale(withPayments))
    if (isSettled(remaining)) {
      const paid = await tx.sale.update({
        where: { id: saleId },
        data: { status: 'PAGADA' },
        include: SALE_INCLUDE,
      })
      // Bs ya convertidos con abonos: estampa profit en la última compra
      await stampClosingProfitIfNeeded(tx, saleId)
      return paid
    }
    return withPayments
  })

  return serializeSale(sale)
}

/**
 * @param {string} paymentId
 * @returns {Promise<{ id: string, saleId: string, receiptPath: string|null } | null>}
 */
export async function findPaymentReceipt(paymentId) {
  const row = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, saleId: true, receiptPath: true },
  })
  return row
}

/**
 * @param {string} paymentId
 * @param {string} receiptPath
 * @returns {Promise<{ saleId: string, previousPath: string|null }>}
 */
export async function setPaymentReceiptPath(paymentId, receiptPath) {
  if (!receiptPath) throw new SaleError(422, 'receiptPath es requerido')
  const current = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, saleId: true, receiptPath: true },
  })
  if (!current) throw new SaleError(404, 'Pago no encontrado')
  await prisma.payment.update({
    where: { id: paymentId },
    data: { receiptPath },
  })
  return { saleId: current.saleId, previousPath: current.receiptPath }
}

/**
 * @param {string} paymentId
 * @returns {Promise<{ saleId: string, previousPath: string }>}
 */
export async function clearPaymentReceipt(paymentId) {
  const current = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, saleId: true, receiptPath: true },
  })
  if (!current) throw new SaleError(404, 'Pago no encontrado')
  if (!current.receiptPath) {
    throw new SaleError(404, 'Este pago no tiene comprobante')
  }
  await prisma.payment.update({
    where: { id: paymentId },
    data: { receiptPath: null },
  })
  return { saleId: current.saleId, previousPath: current.receiptPath }
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

    // Sin entregar no hay SALIDA que compensar: basta con soltar la reserva.
    if (current.deliveryStatus === 'ENTREGADA') {
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
    }

    return tx.sale.update({
      where: { id: saleId },
      data: { status: 'ANULADA' },
      include: SALE_INCLUDE,
    })
  })

  return serializeSale(sale)
}

/**
 * Entrega la mercancía: aquí (y solo aquí) sale el stock físico.
 * @param {string} saleId
 * @param {{ agentName?: string|null }} opts
 */
export async function deliverSale(saleId, { agentName = null } = {}) {
  const sale = await prisma.$transaction(async (tx) => {
    const current = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    })
    if (!current) throw new SaleError(404, 'Venta no encontrada')
    if (current.status === 'ANULADA') {
      throw new SaleError(409, 'No se puede entregar una venta anulada')
    }
    if (current.deliveryStatus === 'ENTREGADA') {
      throw new SaleError(409, 'La venta ya fue entregada')
    }

    await applyMovementsInTx(
      tx,
      current.items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        type: 'SALIDA',
        quantity: it.quantity,
        saleId: current.id,
        note: `entrega venta ${current.id}`,
      })),
      { agentName },
    )

    return tx.sale.update({
      where: { id: saleId },
      data: {
        deliveryStatus: 'ENTREGADA',
        deliveredAt: new Date(),
        deliveredBy: agentName,
      },
      include: SALE_INCLUDE,
    })
  })

  return serializeSale(sale)
}

/**
 * Revierte una entrega marcada por error: devuelve el stock y vuelve a reservar.
 * @param {string} saleId
 * @param {{ agentName?: string|null }} opts
 */
export async function undeliverSale(saleId, { agentName = null } = {}) {
  const sale = await prisma.$transaction(async (tx) => {
    const current = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    })
    if (!current) throw new SaleError(404, 'Venta no encontrada')
    if (current.status === 'ANULADA') {
      throw new SaleError(409, 'Venta anulada')
    }
    if (current.deliveryStatus !== 'ENTREGADA') {
      throw new SaleError(409, 'La venta no está entregada')
    }

    await applyMovementsInTx(
      tx,
      current.items.map((it) => ({
        productId: it.productId,
        variantId: it.variantId,
        type: 'ENTRADA',
        quantity: it.quantity,
        saleId: current.id,
        note: `reversión entrega venta ${current.id}`,
      })),
      { agentName },
    )

    return tx.sale.update({
      where: { id: saleId },
      data: {
        deliveryStatus: 'POR_ENTREGAR',
        deliveredAt: null,
        deliveredBy: null,
      },
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
 * @param {{ status?: string, delivery?: string, customerId?: string, sellerId?: string, from?: string, to?: string, limit?: number, offset?: number }} filters
 */
export async function listSales({
  status,
  delivery,
  customerId,
  sellerId,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const skip = Math.max(Number(offset) || 0, 0)
  const where = {}
  if (status) where.status = status
  if (delivery) where.deliveryStatus = delivery
  if (customerId) where.customerId = customerId
  if (sellerId) where.sellerId = sellerId
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

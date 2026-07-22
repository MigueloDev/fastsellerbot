import { prisma } from './client.js'
import { balanceUsdOf, round2 } from '../sales/balance.js'
import { readRate } from '../rates/store.js'

export class ReportError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'ReportError'
    this.status = status
  }
}

const MAX_KARDEX_ROWS = 2000

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

/**
 * @param {{ from?: Date, to?: Date }} range
 * @param {string} field
 */
function dateWhere({ from, to }, field = 'createdAt') {
  if (!from && !to) return {}
  /** @type {{ gte?: Date, lte?: Date }} */
  const clause = {}
  if (from) clause.gte = from
  if (to) clause.lte = to
  return { [field]: clause }
}

// ─────────────────────────────── Reporte de ventas ───────────────────────────────

/**
 * Detalle de ventas del período + totales. Convención de totales alineada con
 * `/metrics/summary`: **vendido** = ventas no anuladas creadas en el rango,
 * **cobrado** = pagos con `paidAt` en el rango (pueden ser de ventas anteriores).
 *
 * @param {{ from?: Date, to?: Date, status?: string, delivery?: string, customerId?: string }} filters
 */
export async function getSalesReport({
  from,
  to,
  status,
  delivery,
  customerId,
} = {}) {
  /** @type {any} */
  const where = { ...dateWhere({ from, to }) }
  if (status) where.status = status
  if (delivery) where.deliveryStatus = delivery
  if (customerId) where.customerId = customerId

  const [rows, collectedAgg, bsRate] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, cedula: true, phone: true } },
        items: {
          include: {
            product: { select: { id: true, name: true } },
            variant: { select: { id: true, name: true } },
          },
        },
        payments: { orderBy: { paidAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payment.aggregate({
      where: {
        sale: { status: { not: 'ANULADA' } },
        ...dateWhere({ from, to }, 'paidAt'),
      },
      _count: { _all: true },
      _sum: { amountUsd: true },
    }),
    readRate('BCV'),
  ])

  const sales = rows.map((sale) => {
    const totalUsd = toNum(sale.totalUsd)
    const collectedUsd = round2(
      sale.payments.reduce((sum, p) => sum + toNum(p.amountUsd), 0),
    )
    return {
      id: sale.id,
      createdAt: sale.createdAt,
      status: sale.status,
      deliveryStatus: sale.deliveryStatus,
      deliveredAt: sale.deliveredAt,
      priceRef: sale.priceRef,
      customerId: sale.customerId,
      customerName: sale.customer?.name ?? '—',
      customerCedula: sale.customer?.cedula ?? null,
      items: sale.items.map((it) => ({
        productId: it.productId,
        productName: it.product?.name ?? '—',
        variantId: it.variantId,
        variantName: it.variant?.name ?? null,
        quantity: it.quantity,
        unitPriceUsd: toNum(it.unitPriceUsd),
        subtotalUsd: toNum(it.subtotalUsd),
      })),
      totalUsd,
      collectedUsd,
      balanceUsd: balanceUsdOf({ totalUsd, payments: sale.payments }),
      paymentsCount: sale.payments.length,
      note: sale.note,
      agentName: sale.agentName,
    }
  })

  const live = sales.filter((s) => s.status !== 'ANULADA')
  const totalUsd = round2(live.reduce((sum, s) => sum + s.totalUsd, 0))
  const balanceUsd = round2(live.reduce((sum, s) => sum + s.balanceUsd, 0))
  const collectedUsd = round2(toNum(collectedAgg._sum.amountUsd))
  const rate = bsRate && bsRate.rate > 0 ? bsRate : null

  return {
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    filters: {
      status: status ?? null,
      delivery: delivery ?? null,
      customerId: customerId ?? null,
    },
    totals: {
      count: live.length,
      voidedCount: sales.length - live.length,
      totalUsd,
      collectedUsd,
      collectedCount: collectedAgg._count._all,
      balanceUsd,
      totalBs: rate ? round2(totalUsd * rate.rate) : null,
      collectedBs: rate ? round2(collectedUsd * rate.rate) : null,
      balanceBs: rate ? round2(balanceUsd * rate.rate) : null,
      bsRate: rate ? { rate: rate.rate, fetchedAt: rate.fetchedAt } : null,
    },
    byPriceRef: summarizeByPriceRef(live),
    byDelivery: summarizeByDelivery(live),
    byProduct: summarizeByProduct(live),
    sales,
  }
}

function summarizeByPriceRef(sales) {
  const out = {
    REF_USD: { count: 0, totalUsd: 0 },
    REF_BS: { count: 0, totalUsd: 0 },
  }
  for (const sale of sales) {
    const bucket = out[sale.priceRef]
    if (!bucket) continue
    bucket.count += 1
    bucket.totalUsd = round2(bucket.totalUsd + sale.totalUsd)
  }
  return out
}

function summarizeByDelivery(sales) {
  const out = {
    POR_ENTREGAR: { count: 0, totalUsd: 0 },
    ENTREGADA: { count: 0, totalUsd: 0 },
  }
  for (const sale of sales) {
    const bucket = out[sale.deliveryStatus]
    if (!bucket) continue
    bucket.count += 1
    bucket.totalUsd = round2(bucket.totalUsd + sale.totalUsd)
  }
  return out
}

/** Unidades y facturación por producto/variante, de mayor a menor. */
function summarizeByProduct(sales) {
  const map = new Map()
  for (const sale of sales) {
    for (const it of sale.items) {
      const key = `${it.productId}|${it.variantId ?? ''}`
      const prev = map.get(key)
      if (prev) {
        prev.unitsSold += it.quantity
        prev.revenueUsd = round2(prev.revenueUsd + it.subtotalUsd)
      } else {
        map.set(key, {
          productId: it.productId,
          productName: it.productName,
          variantId: it.variantId,
          variantName: it.variantName,
          unitsSold: it.quantity,
          revenueUsd: it.subtotalUsd,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => b.revenueUsd - a.revenueUsd)
}

// ────────────────────────────────── Kardex ──────────────────────────────────

/**
 * Kardex: ledger de movimientos con saldo corrido por nivel (producto+variante).
 *
 * El saldo corrido se apoya en el mismo invariante que `scripts/rebuild-stock.js`:
 * `StockLevel.quantity === SUM(delta)`. Por eso el saldo final de un kardex sin
 * `to` coincide siempre con el stock físico actual.
 *
 * @param {{ productId: string, variantId?: string|null, from?: Date, to?: Date }} filters
 */
export async function getKardex({ productId, variantId, from, to } = {}) {
  if (!productId) throw new ReportError(422, 'productId es requerido')

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { name: 'asc' } } },
  })
  if (!product) throw new ReportError(404, 'Producto no encontrado')

  const activeVariants = product.variants.filter((v) => v.active)
  /** @type {Array<{ id: string|null, name: string|null }>} */
  let targets
  if (variantId) {
    const variant = product.variants.find((v) => v.id === variantId)
    if (!variant) throw new ReportError(422, 'Variante no encontrada')
    targets = [{ id: variant.id, name: variant.name }]
  } else if (activeVariants.length > 0) {
    targets = activeVariants.map((v) => ({ id: v.id, name: v.name }))
  } else {
    targets = [{ id: null, name: null }]
  }

  const sections = []
  for (const target of targets) {
    sections.push(await kardexSection(productId, target, { from, to }))
  }

  return {
    product: { id: product.id, name: product.name, sku: product.sku },
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    sections,
  }
}

/**
 * @param {string} productId
 * @param {{ id: string|null, name: string|null }} variant
 * @param {{ from?: Date, to?: Date }} range
 */
async function kardexSection(productId, variant, { from, to }) {
  const base = { productId, variantId: variant.id }

  const [openingAgg, rows, level] = await Promise.all([
    from
      ? prisma.stockMovement.aggregate({
          where: { ...base, createdAt: { lt: from } },
          _sum: { delta: true },
        })
      : Promise.resolve({ _sum: { delta: 0 } }),
    prisma.stockMovement.findMany({
      where: { ...base, ...dateWhere({ from, to }) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_KARDEX_ROWS + 1,
    }),
    prisma.stockLevel.findFirst({ where: base }),
  ])

  const truncated = rows.length > MAX_KARDEX_ROWS
  const movements = truncated ? rows.slice(0, MAX_KARDEX_ROWS) : rows

  const opening = openingAgg._sum.delta ?? 0
  let balance = opening
  let totalIn = 0
  let totalOut = 0

  const withBalance = movements.map((mov) => {
    balance += mov.delta
    if (mov.delta > 0) totalIn += mov.delta
    else totalOut += -mov.delta
    return {
      id: mov.id,
      createdAt: mov.createdAt,
      type: mov.type,
      quantity: mov.quantity,
      delta: mov.delta,
      entrada: mov.delta > 0 ? mov.delta : 0,
      salida: mov.delta < 0 ? -mov.delta : 0,
      balance,
      unitCost: mov.unitCost != null ? toNum(mov.unitCost) : null,
      saleId: mov.saleId,
      note: mov.note,
      agentName: mov.agentName,
    }
  })

  return {
    variantId: variant.id,
    variantName: variant.name,
    opening,
    closing: balance,
    totalIn,
    totalOut,
    onHand: level?.quantity ?? 0,
    truncated,
    movements: withBalance,
  }
}

// ────────────────────── Movimientos globales por producto ──────────────────────

/**
 * Ledger plano de todos los movimientos de un producto (todas las variantes
 * en una sola lista). Sin saldo corrido — eso vive en el kardex por nivel.
 *
 * @param {{ productId: string, from?: Date, to?: Date }} filters
 */
export async function getProductMovements({ productId, from, to } = {}) {
  if (!productId) throw new ReportError(422, 'productId es requerido')

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { orderBy: { name: 'asc' } } },
  })
  if (!product) throw new ReportError(404, 'Producto no encontrado')

  const variantNames = new Map(product.variants.map((v) => [v.id, v.name]))

  const rows = await prisma.stockMovement.findMany({
    where: { productId, ...dateWhere({ from, to }) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_KARDEX_ROWS + 1,
  })

  const truncated = rows.length > MAX_KARDEX_ROWS
  const slice = truncated ? rows.slice(0, MAX_KARDEX_ROWS) : rows

  let totalIn = 0
  let totalOut = 0
  const movements = slice.map((mov) => {
    if (mov.delta > 0) totalIn += mov.delta
    else totalOut += -mov.delta
    return {
      id: mov.id,
      createdAt: mov.createdAt,
      type: mov.type,
      quantity: mov.quantity,
      delta: mov.delta,
      entrada: mov.delta > 0 ? mov.delta : 0,
      salida: mov.delta < 0 ? -mov.delta : 0,
      variantId: mov.variantId,
      variantName: mov.variantId ? (variantNames.get(mov.variantId) ?? null) : null,
      saleId: mov.saleId,
      note: mov.note,
      agentName: mov.agentName,
    }
  })

  return {
    product: { id: product.id, name: product.name, sku: product.sku },
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    totals: { totalIn, totalOut, count: movements.length },
    truncated,
    movements,
  }
}

import { prisma } from './client.js'
import { balanceUsdOf, round2 } from '../sales/balance.js'
import { paymentStateOf } from '../sales/paymentState.js'
import { fxAvailability, expectedUsdt } from '../sales/profit.js'
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
 * `paymentState` (PAGADA|ABONADA|CREDITO) filtra en memoria tras mapear filas.
 *
 * @param {{ from?: Date, to?: Date, status?: string, delivery?: string, customerId?: string, paymentState?: string }} filters
 */
export async function getSalesReport({
  from,
  to,
  status,
  delivery,
  customerId,
  paymentState,
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

  let sales = rows.map((sale) => {
    const totalUsd = toNum(sale.totalUsd)
    const collectedUsd = round2(
      sale.payments.reduce((sum, p) => sum + toNum(p.amountUsd), 0),
    )
    const paymentsCount = sale.payments.length
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
      paymentsCount,
      paymentState: paymentStateOf({ status: sale.status, paymentsCount }),
      note: sale.note,
      agentName: sale.agentName,
    }
  })

  if (paymentState) {
    sales = sales.filter((s) => s.paymentState === paymentState)
  }

  const live = sales.filter((s) => s.status !== 'ANULADA')
  const totalUsd = round2(live.reduce((sum, s) => sum + s.totalUsd, 0))
  const balanceUsd = round2(live.reduce((sum, s) => sum + s.balanceUsd, 0))
  const unitsSold = live.reduce(
    (sum, s) => sum + s.items.reduce((n, it) => n + it.quantity, 0),
    0,
  )
  // When filtering by paymentState, cash collected-in-range still uses the
  // period aggregate (may include payments on sales outside the filtered set).
  const collectedUsd = round2(toNum(collectedAgg._sum.amountUsd))
  const rate = bsRate && bsRate.rate > 0 ? bsRate : null
  const rate2 = rate ? round2(rate.rate) : null

  return {
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    filters: {
      status: status ?? null,
      delivery: delivery ?? null,
      customerId: customerId ?? null,
      paymentState: paymentState ?? null,
    },
    totals: {
      count: live.length,
      voidedCount: sales.length - live.length,
      unitsSold,
      totalUsd,
      collectedUsd,
      collectedCount: collectedAgg._count._all,
      balanceUsd,
      totalBs: rate2 != null ? round2(totalUsd * rate2) : null,
      collectedBs: rate2 != null ? round2(collectedUsd * rate2) : null,
      balanceBs: rate2 != null ? round2(balanceUsd * rate2) : null,
      bsRate: rate2 != null ? { rate: rate2, fetchedAt: rate.fetchedAt } : null,
    },
    byPriceRef: summarizeByPriceRef(live),
    byDelivery: summarizeByDelivery(live),
    byPaymentState: summarizeByPaymentState(live),
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

function emptyPaymentBucket() {
  return { count: 0, unitsSold: 0, totalUsd: 0, collectedUsd: 0, balanceUsd: 0 }
}

function summarizeByPaymentState(sales) {
  const out = {
    PAGADA: emptyPaymentBucket(),
    ABONADA: emptyPaymentBucket(),
    CREDITO: emptyPaymentBucket(),
  }
  for (const sale of sales) {
    const bucket = sale.paymentState ? out[sale.paymentState] : null
    if (!bucket) continue
    const units = sale.items.reduce((n, it) => n + it.quantity, 0)
    bucket.count += 1
    bucket.unitsSold += units
    bucket.totalUsd = round2(bucket.totalUsd + sale.totalUsd)
    bucket.collectedUsd = round2(bucket.collectedUsd + sale.collectedUsd)
    bucket.balanceUsd = round2(bucket.balanceUsd + sale.balanceUsd)
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

// ────────────────────── Conciliación ventas ↔ divisas ──────────────────────

/** USDT a 6 dp (mismo techo que `profit.js`). */
function roundUsdt(n) {
  return Math.round(n * 1e6) / 1e6
}

function profitFromAllocs(allocations = []) {
  let any = false
  let sum = 0
  for (const a of allocations) {
    if (a.profitUsd != null) {
      any = true
      sum += toNum(a.profitUsd)
    }
  }
  return any ? round2(sum) : null
}

/**
 * Conciliación Bs cobrados vs convertidos a USDT.
 *
 * Ventas: `createdAt` en rango, historial completo de pagos/allocations
 * (la identidad `bsCobrados = bsConvertidos + bsPendientes` siempre cuadra).
 * Compras: `purchasedAt` en rango, tabla independiente.
 *
 * @param {{ from?: Date, to?: Date }} filters
 */
export async function getFxReport({ from, to } = {}) {
  const [salesRows, purchaseRows] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: { not: 'ANULADA' },
        payments: { some: { currency: 'BS' } },
        ...dateWhere({ from, to }),
      },
      include: {
        customer: { select: { id: true, name: true, cedula: true } },
        payments: true,
        currencyPurchaseAllocations: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.currencyPurchase.findMany({
      where: dateWhere({ from, to }, 'purchasedAt'),
      include: { allocations: { select: { saleId: true } } },
      orderBy: { purchasedAt: 'desc' },
    }),
  ])

  const sales = salesRows.map((sale) => {
    const fx = fxAvailability(sale.payments, sale.currencyPurchaseAllocations)
    return {
      id: sale.id,
      createdAt: sale.createdAt,
      customer: sale.customer,
      status: sale.status,
      paymentState: paymentStateOf({
        status: sale.status,
        paymentsCount: sale.payments.length,
      }),
      totalUsd: toNum(sale.totalUsd),
      bsCollected: fx.totalBs,
      bsConverted: fx.bsConverted,
      bsPending: fx.bsAvailable,
      usdtReceived: fx.usdtReceived,
      usdCollected: fx.totalUsdCollected,
      profitUsd: profitFromAllocs(sale.currencyPurchaseAllocations),
      paymentsCount: sale.payments.length,
      purchasesCount: sale.currencyPurchaseAllocations.length,
    }
  })

  const purchases = purchaseRows.map((p) => {
    const bsSpent = toNum(p.bsSpent)
    const usdt = toNum(p.usdtReceived)
    const expected = expectedUsdt(bsSpent, toNum(p.binanceRate))
    const saleIds = (p.allocations ?? []).map((a) => a.saleId)
    return {
      id: p.id,
      purchasedAt: p.purchasedAt,
      binanceRate: toNum(p.binanceRate),
      bsSpent,
      usdtReceived: usdt,
      expectedUsdt: expected,
      diffUsdt: expected != null ? roundUsdt(usdt - expected) : null,
      salesCount: saleIds.length,
      saleIds,
      note: p.note,
      agentName: p.agentName,
    }
  })

  let bsCollected = 0
  let bsConverted = 0
  let bsPending = 0
  let usdtReceived = 0
  let usdCollected = 0
  let profitSum = 0
  let anyProfit = false

  for (const s of sales) {
    bsCollected += s.bsCollected
    bsConverted += s.bsConverted
    bsPending += s.bsPending
    usdtReceived += s.usdtReceived
    usdCollected += s.usdCollected
    if (s.profitUsd != null) {
      anyProfit = true
      profitSum += s.profitUsd
    }
  }

  let purchasesBsSpent = 0
  let purchasesUsdt = 0
  for (const p of purchases) {
    purchasesBsSpent += p.bsSpent
    purchasesUsdt += p.usdtReceived
  }

  return {
    period: { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
    totals: {
      count: sales.length,
      bsCollected: round2(bsCollected),
      bsConverted: round2(bsConverted),
      bsPending: round2(bsPending),
      usdtReceived: roundUsdt(usdtReceived),
      usdCollected: round2(usdCollected),
      profitUsd: anyProfit ? round2(profitSum) : null,
      purchasesCount: purchases.length,
      purchasesBsSpent: round2(purchasesBsSpent),
      purchasesUsdt: roundUsdt(purchasesUsdt),
    },
    sales,
    purchases,
  }
}

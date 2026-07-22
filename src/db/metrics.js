import { prisma } from './client.js'
import { listReceivables } from './sales.js'
import { listStockLevels } from './stock.js'
import { balanceView } from '../sales/balance.js'
import { summarizeReceivables } from '../sales/receivablesSummary.js'

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

/**
 * @param {{ from?: Date, to?: Date }} range
 */
function saleDateWhere({ from, to }) {
  /** @type {{ status: { not: string }, createdAt?: { gte?: Date, lte?: Date } }} */
  const where = { status: { not: 'ANULADA' } }
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = from
    if (to) where.createdAt.lte = to
  }
  return where
}

/**
 * @param {{ from?: Date, to?: Date }} range
 */
async function soldAgg(range) {
  const where = saleDateWhere(range)
  const result = await prisma.sale.aggregate({
    where,
    _count: { _all: true },
    _sum: { totalUsd: true },
  })
  return {
    count: result._count._all,
    totalUsd: toNum(result._sum.totalUsd),
  }
}

/**
 * @param {{ from?: Date, to?: Date }} range
 */
async function collectedAgg(range) {
  const { from, to } = range
  /** @type {{ sale: { status: { not: string } }, paidAt?: { gte?: Date, lte?: Date } }} */
  const where = { sale: { status: { not: 'ANULADA' } } }
  if (from || to) {
    where.paidAt = {}
    if (from) where.paidAt.gte = from
    if (to) where.paidAt.lte = to
  }
  const result = await prisma.payment.aggregate({
    where,
    _count: { _all: true },
    _sum: { amountUsd: true },
  })
  return {
    count: result._count._all,
    totalUsd: toNum(result._sum.amountUsd),
  }
}

/**
 * @param {{ from?: Date, to?: Date }} range
 */
async function byPriceRefAgg(range) {
  const rows = await prisma.sale.groupBy({
    by: ['priceRef'],
    where: saleDateWhere(range),
    _count: { _all: true },
    _sum: { totalUsd: true },
  })
  const out = {
    REF_USD: { count: 0, totalUsd: 0 },
    REF_BS: { count: 0, totalUsd: 0 },
  }
  for (const row of rows) {
    if (row.priceRef !== 'REF_USD' && row.priceRef !== 'REF_BS') continue
    out[row.priceRef] = {
      count: row._count._all,
      totalUsd: toNum(row._sum.totalUsd),
    }
  }
  return out
}

/**
 * @param {{ from?: Date, to?: Date }} range
 */
async function topProductsAgg(range) {
  const where = {
    sale: saleDateWhere(range),
  }
  const grouped = await prisma.saleItem.groupBy({
    by: ['productId', 'variantId'],
    where,
    _sum: { quantity: true, subtotalUsd: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take: 5,
  })

  if (grouped.length === 0) return []

  const productIds = [...new Set(grouped.map((g) => g.productId))]
  const variantIds = [
    ...new Set(grouped.map((g) => g.variantId).filter(Boolean)),
  ]

  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    }),
    variantIds.length
      ? prisma.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  const productName = new Map(products.map((p) => [p.id, p.name]))
  const variantName = new Map(variants.map((v) => [v.id, v.name]))

  return grouped.map((g) => ({
    productId: g.productId,
    productName: productName.get(g.productId) ?? '—',
    variantId: g.variantId,
    variantName: g.variantId ? (variantName.get(g.variantId) ?? null) : null,
    unitsSold: g._sum.quantity ?? 0,
    revenueUsd: toNum(g._sum.subtotalUsd),
  }))
}

/**
 * @param {{ from?: Date, to?: Date }} range
 */
async function salesByDayAgg(range) {
  const { from, to } = range
  /** @type {Array<{ date: Date|string, totalUsd: unknown }>} */
  let rows
  // ponytail: día de negocio = Caracas; si algún día hay multi-tz, parametrizar
  if (from && to) {
    rows = await prisma.$queryRaw`
      SELECT (created_at AT TIME ZONE 'America/Caracas')::date AS date,
             COALESCE(SUM(total_usd), 0) AS "totalUsd"
      FROM sales
      WHERE status != 'ANULADA'
        AND created_at >= ${from}
        AND created_at <= ${to}
      GROUP BY 1
      ORDER BY 1
    `
  } else if (from) {
    rows = await prisma.$queryRaw`
      SELECT (created_at AT TIME ZONE 'America/Caracas')::date AS date,
             COALESCE(SUM(total_usd), 0) AS "totalUsd"
      FROM sales
      WHERE status != 'ANULADA'
        AND created_at >= ${from}
      GROUP BY 1
      ORDER BY 1
    `
  } else if (to) {
    rows = await prisma.$queryRaw`
      SELECT (created_at AT TIME ZONE 'America/Caracas')::date AS date,
             COALESCE(SUM(total_usd), 0) AS "totalUsd"
      FROM sales
      WHERE status != 'ANULADA'
        AND created_at <= ${to}
      GROUP BY 1
      ORDER BY 1
    `
  } else {
    rows = await prisma.$queryRaw`
      SELECT (created_at AT TIME ZONE 'America/Caracas')::date AS date,
             COALESCE(SUM(total_usd), 0) AS "totalUsd"
      FROM sales
      WHERE status != 'ANULADA'
      GROUP BY 1
      ORDER BY 1
    `
  }

  return rows.map((r) => {
    let dateStr
    if (r.date instanceof Date) {
      // PG date → JS Date at UTC midnight
      const yyyy = r.date.getUTCFullYear()
      const mm = String(r.date.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(r.date.getUTCDate()).padStart(2, '0')
      dateStr = `${yyyy}-${mm}-${dd}`
    } else {
      dateStr = String(r.date).slice(0, 10)
    }
    return {
      date: dateStr,
      totalUsd: toNum(r.totalUsd),
    }
  })
}

async function receivablesSnapshot() {
  const sales = await listReceivables()
  const withBal = await Promise.all(
    sales.map(async (sale) => {
      const bal = await balanceView(sale)
      return { ...sale, ...bal }
    }),
  )
  const summary = summarizeReceivables(withBal)
  return {
    totalUsd: summary.totalOwedUsd,
    totalBs: summary.totalOwedBs,
    bsRate: summary.bsRate,
  }
}

async function lowStockList() {
  const levels = await listStockLevels()
  return levels
    .filter((l) => l.lowStock)
    .map((l) => ({
      productName: l.productName,
      variantName: l.variantName,
      quantity: l.quantity,
      committed: l.committed,
      available: l.available,
      minStock: l.minStock,
    }))
}

/**
 * Resumen home dashboard. Periodo aplica a sold/collected/byPriceRef/topProducts/salesByDay.
 * receivables y lowStock son snapshots globales.
 *
 * @param {{ from?: Date, to?: Date }} range
 */
export async function getMetricsSummary(range = {}) {
  const [
    sold,
    collected,
    byPriceRef,
    topProducts,
    salesByDay,
    receivables,
    lowStock,
  ] = await Promise.all([
    soldAgg(range),
    collectedAgg(range),
    byPriceRefAgg(range),
    topProductsAgg(range),
    salesByDayAgg(range),
    receivablesSnapshot(),
    lowStockList(),
  ])

  return {
    period: {
      from: range.from?.toISOString() ?? null,
      to: range.to?.toISOString() ?? null,
    },
    sold,
    collected,
    receivables,
    byPriceRef,
    topProducts,
    salesByDay,
    lowStock,
  }
}

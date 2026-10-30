import { prisma } from './client.js'

function serializeRate(row) {
  if (!row) return null
  return {
    rate: Number(row.rate),
    fetchedAt: row.fetchedAt.toISOString(),
  }
}

export async function insertRate(source, rate, fetchedAt = new Date()) {
  const row = await prisma.exchangeRate.create({
    data: { source, rate, fetchedAt },
  })
  return serializeRate(row)
}

export async function getLatestRate(source) {
  const row = await prisma.exchangeRate.findFirst({
    where: { source },
    orderBy: { fetchedAt: 'desc' },
  })
  return serializeRate(row)
}

export async function listRates(source, { limit = 24 } = {}) {
  const take = Math.min(Math.max(Math.trunc(limit) || 24, 1), 100)
  const rows = await prisma.exchangeRate.findMany({
    where: source ? { source } : undefined,
    orderBy: { fetchedAt: 'desc' },
    take,
  })
  return rows.map((r) => ({ id: r.id, source: r.source, ...serializeRate(r) }))
}

/**
 * Última(s) tasa(s) con `fetchedAt <= at` — usa el índice `(source, fetched_at DESC)`.
 * Pensado para `resolveRateAt` (pagos offline con `paidAt` pasado).
 * @param {'BCV'|'BINANCE'} source
 * @param {Date} at
 * @param {number} [take]
 */
export async function listRatesUpTo(source, at, take = 1) {
  const rows = await prisma.exchangeRate.findMany({
    where: { source, fetchedAt: { lte: at } },
    orderBy: { fetchedAt: 'desc' },
    take,
  })
  return rows.map((r) => serializeRate(r))
}

export async function getRateById(id) {
  const row = await prisma.exchangeRate.findUnique({ where: { id } })
  if (!row) return null
  return { id: row.id, source: row.source, ...serializeRate(row) }
}

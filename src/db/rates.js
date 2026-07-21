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

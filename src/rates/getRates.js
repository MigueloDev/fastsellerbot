import { readRate } from './store.js'

/**
 * @returns {Promise<{
 *   bcv: { rate: number, fetchedAt: string } | null,
 *   binance: { rate: number, fetchedAt: string } | null,
 *   gap: number | null,
 * }>}
 */
export async function getRates() {
  const [bcv, binance] = await Promise.all([
    readRate('BCV'),
    readRate('BINANCE'),
  ])

  let gap = null
  if (bcv && binance && bcv.rate > 0) {
    gap = binance.rate / bcv.rate - 1
  }

  return { bcv, binance, gap }
}

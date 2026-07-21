import { getLatestRate } from '../db/rates.js'
import { fetchBcv } from './fetchBcv.js'
import { fetchBinance } from './fetchBinance.js'
import { validateRate } from './validate.js'
import { storeRate } from './store.js'

/**
 * Fetch → validate → store. Throws on upstream/network failure (BullMQ retries).
 * Garbage rates are discarded without throw (no useless retries).
 * @param {'BCV'|'BINANCE'} source
 */
export async function processRateFetch(source) {
  const fetched = source === 'BCV' ? await fetchBcv() : await fetchBinance()
  const previous = await getLatestRate(source)
  const check = validateRate(fetched.rate, previous?.rate)

  if (!check.ok) {
    const level = check.reason.includes('deviation') ? 'warn' : 'error'
    const msg = `Rate ${source} discarded: ${check.reason} (got ${fetched.rate})`
    if (level === 'warn') console.warn('⚠️ ', msg)
    else console.error('❌', msg)
    return { stored: false, reason: check.reason }
  }

  const saved = await storeRate(source, fetched.rate, fetched.fetchedAt)
  console.log(`💱 Rate ${source} stored:`, saved.rate)
  return { stored: true, rate: saved }
}

import { getLatestRate } from '../db/rates.js'
import { fetchBcv } from './fetchBcv.js'
import { fetchBinance } from './fetchBinance.js'
import { RATE_INTERVALS_MS } from './intervals.js'
import { validateRate, isRateTooRecent } from './validate.js'
import { storeRate } from './store.js'

/**
 * Fetch → validate → store. Throws on upstream/network failure (BullMQ retries).
 * Garbage rates / too-recent skips are discarded without throw (no useless retries).
 * @param {'BCV'|'BINANCE'} source
 */
export async function processRateFetch(source) {
  const previous = await getLatestRate(source)
  const intervalMs = RATE_INTERVALS_MS[source]
  if (isRateTooRecent(previous?.fetchedAt, intervalMs)) {
    console.log(`💱 Rate ${source} skipped: too_recent`)
    return { stored: false, reason: 'too_recent' }
  }

  const fetched = source === 'BCV' ? await fetchBcv() : await fetchBinance()
  const check = validateRate(fetched.rate, previous?.rate)

  if (!check.ok) {
    const level = check.reason.includes('deviation') ? 'warn' : 'error'
    const msg = `Rate ${source} discarded: ${check.reason} (got ${fetched.rate})`
    if (level === 'warn') console.warn('⚠️ ', msg)
    else console.error('❌', msg)
    return { stored: false, reason: check.reason }
  }

  const saved = await storeRate(source, fetched.rate, source !== 'BCV' ? fetched.fetchedAt : new Date());
  console.log(`💱 Rate ${source} stored:`, saved.rate)
  return { stored: true, rate: saved }
}

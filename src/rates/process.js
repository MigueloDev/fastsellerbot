import { getLatestRate } from '../db/rates.js'
import { fetchBcv } from './fetchBcv.js'
import { fetchBinance } from './fetchBinance.js'
import { RATE_INTERVALS_MS } from './intervals.js'
import { validateRate, isRateTooRecent, bcvDayAlreadyStored } from './validate.js'
import { storeRate } from './store.js'

/**
 * Fetch → validate → store. Throws on upstream/network failure (BullMQ retries).
 * Garbage rates / too-recent skips are discarded without throw (no useless retries).
 * @param {'BCV'|'BINANCE'} source
 * @param {{ force?: boolean }} [opts] force = refresco manual: ignora too_recent y same_day.
 */
export async function processRateFetch(source, { force = false } = {}) {
  const previous = await getLatestRate(source)
  const intervalMs = RATE_INTERVALS_MS[source]
  if (!force && isRateTooRecent(previous?.fetchedAt, intervalMs)) {
    console.log(`💱 Rate ${source} skipped: too_recent`)
    return { stored: false, reason: 'too_recent' }
  }

  const fetched = source === 'BCV' ? await fetchBcv() : await fetchBinance()
  // Ya hay tasa guardada para ese día (p.ej. carga manual): el job no la pisa con upstream atrasado.
  if (source === 'BCV' && !force && fetched.day && bcvDayAlreadyStored(fetched.day, previous?.fetchedAt)) {
    console.log(`💱 Rate ${source} skipped: same_day`)
    return { stored: false, reason: 'same_day' }
  }

  const check = validateRate(fetched.rate, previous?.rate)

  if (!check.ok) {
    const level = check.reason.includes('deviation') ? 'warn' : 'error'
    const msg = `Rate ${source} discarded: ${check.reason} (got ${fetched.rate})`
    if (level === 'warn') console.warn('⚠️ ', msg)
    else console.error('❌', msg)
    return { stored: false, reason: check.reason }
  }

  // BCV se consulta seguido (publica hoy la tasa de mañana): solo guardar si cambió,
  // si no el historial (BcvRatePicker) se llena de filas repetidas. Columna Decimal(14,4).
  if (source === 'BCV' && previous && Math.round(fetched.rate * 1e4) === Math.round(previous.rate * 1e4)) {
    console.log(`💱 Rate ${source} skipped: unchanged`)
    return { stored: false, reason: 'unchanged' }
  }

  const saved = await storeRate(source, fetched.rate, source !== 'BCV' ? fetched.fetchedAt : new Date());
  console.log(`💱 Rate ${source} stored:`, saved.rate)
  return { stored: true, rate: saved }
}

/**
 * Tasa cargada a mano por un admin (upstream desfasado). Misma sanidad que el job.
 * @param {'BCV'|'BINANCE'} source
 * @param {number} rate
 */
export async function storeManualRate(source, rate) {
  const previous = await getLatestRate(source)
  const check = validateRate(rate, previous?.rate)
  if (!check.ok) return { stored: false, reason: check.reason }
  const saved = await storeRate(source, rate)
  console.log(`💱 Rate ${source} manual:`, saved.rate)
  return { stored: true, rate: saved }
}

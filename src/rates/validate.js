import { pathToFileURL } from 'node:url'

/**
 * @param {number} rate
 * @param {number|null|undefined} previousRate
 * @param {number} [threshold]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateRate(rate, previousRate, threshold = Number(process.env.RATE_SANITY_THRESHOLD ?? 0.15)) {
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: 'rate <= 0 or non-numeric' }
  }

  if (previousRate == null || !Number.isFinite(previousRate) || previousRate <= 0) {
    return { ok: true }
  }

  const deviation = Math.abs(rate - previousRate) / previousRate
  if (deviation > threshold) {
    return {
      ok: false,
      reason: `deviation ${(deviation * 100).toFixed(1)}% > ${(threshold * 100).toFixed(0)}%`,
    }
  }

  return { ok: true }
}

/**
 * True if last persisted rate is still within the worker interval (skip fetch/store).
 * @param {Date|string|null|undefined} fetchedAt
 * @param {number} intervalMs
 * @param {number} [now]
 */
export function isRateTooRecent(fetchedAt, intervalMs, now = Date.now()) {
  if (fetchedAt == null) return false
  const t = new Date(fetchedAt).getTime()
  if (!Number.isFinite(t)) return false
  return now - t < intervalMs
}

/**
 * BCV publica una tasa por día de vigencia. True si ya hay fila guardada ese día
 * (hora Caracas) o después → no volver a guardar (protege la carga manual del día).
 * ponytail: una corrección upstream con el mismo día se ignora hasta el día siguiente; usar "Refrescar".
 * @param {string} upstreamDay YYYY-MM-DD
 * @param {Date|string|null|undefined} previousFetchedAt
 */
export function bcvDayAlreadyStored(upstreamDay, previousFetchedAt) {
  if (previousFetchedAt == null) return false
  const prev = new Date(previousFetchedAt)
  if (!Number.isFinite(prev.getTime())) return false
  const prevDay = prev.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
  return String(upstreamDay).slice(0, 10) <= prevDay
}

// ponytail: self-check — fails if sanity / freshness logic breaks
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg)
  }
  assert(validateRate(0, null).ok === false, 'zero rejected')
  assert(validateRate(NaN, null).ok === false, 'NaN rejected')
  assert(validateRate(40, null).ok === true, 'first accept')
  assert(validateRate(40, 40).ok === true, 'same ok')
  assert(validateRate(40 * 1.14, 40).ok === true, '14% under threshold')
  assert(validateRate(40 * 1.16, 40).ok === false, '16% over threshold')
  assert(validateRate(40 * 0.84, 40).ok === false, '16% down rejected')

  const tenMin = 10 * 60 * 1000
  const now = Date.now()
  assert(isRateTooRecent(null, tenMin, now) === false, 'null not too recent')
  assert(isRateTooRecent(new Date(now - 60_000), tenMin, now) === true, '1m ago too recent')
  assert(isRateTooRecent(new Date(now - 11 * 60_000), tenMin, now) === false, '11m ago ok')

  // 2026-11-11 10:00 Caracas = 14:00Z
  const manual = '2026-11-11T14:00:00.000Z'
  assert(bcvDayAlreadyStored('2026-11-11', manual) === true, 'same day blocked')
  assert(bcvDayAlreadyStored('2026-11-10', manual) === true, 'stale upstream blocked')
  assert(bcvDayAlreadyStored('2026-11-12', manual) === false, 'next day allowed')
  assert(bcvDayAlreadyStored('2026-11-12', '2026-11-12T02:00:00.000Z') === false, '22:00 Caracas still day 11')
  assert(bcvDayAlreadyStored('2026-11-11', null) === false, 'no previous allowed')
  console.log('validate.js ok')
}

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
  console.log('validate.js ok')
}

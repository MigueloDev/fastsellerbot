/**
 * Parse env intervals like "4h", "10m", "30s", or raw milliseconds.
 * @param {string|number} raw
 * @param {number} fallbackMs
 */
export function parseInterval(raw, fallbackMs) {
  if (raw == null || raw === '') return fallbackMs
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw

  const s = String(raw).trim()
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n > 0 ? n : fallbackMs
  }

  const m = s.match(/^(\d+(?:\.\d+)?)\s*([smhd])$/i)
  if (!m) return fallbackMs

  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  const mult =
    unit === 's' ? 1000 :
    unit === 'm' ? 60_000 :
    unit === 'h' ? 3_600_000 :
    86_400_000 // d

  const ms = n * mult
  return ms > 0 ? ms : fallbackMs
}

/**
 * Parsea from/to ISO de un querystring. Sin ambos = "Todo" (sin filtro de fecha).
 * Compartido por /metrics/summary y /reports/*.
 *
 * @param {{ from?: string, to?: string }} query
 * @returns {{ from?: Date, to?: Date } | { error: string }}
 */
export function parseRange(query) {
  const { from: fromRaw, to: toRaw } = query ?? {}
  if (fromRaw == null && toRaw == null) return {}

  /** @type {{ from?: Date, to?: Date }} */
  const range = {}
  if (fromRaw != null) {
    const from = new Date(fromRaw)
    if (Number.isNaN(from.getTime())) return { error: 'from inválido' }
    range.from = from
  }
  if (toRaw != null) {
    const to = new Date(toRaw)
    if (Number.isNaN(to.getTime())) return { error: 'to inválido' }
    range.to = to
  }
  if (range.from && range.to && range.from > range.to) {
    return { error: 'from debe ser <= to' }
  }
  return range
}

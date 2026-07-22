/**
 * Agrupa ventas PENDIENTE (ya con balanceUsd/balanceBs/bsRate) por cliente.
 * Única fuente de totales CxC — usada por GET /receivables y GET /metrics/summary.
 *
 * @param {Array<{
 *   customerId: string,
 *   customer: object,
 *   createdAt: string|Date,
 *   balanceUsd: number,
 *   balanceBs: number|null,
 *   bsRate: { rate: number, fetchedAt: string }|null,
 * }>} salesWithBalance
 */
export function summarizeReceivables(salesWithBalance) {
  /** @type {Map<string, { customer: object, sales: object[], totalOwedUsd: number, totalOwedBs: number|null, oldestAt: string|Date }>} */
  const byCustomer = new Map()
  let grandUsd = 0
  let grandBs = 0
  let hasBs = false
  let bsRate = null

  for (const s of salesWithBalance) {
    const key = s.customerId
    let group = byCustomer.get(key)
    if (!group) {
      group = {
        customer: s.customer,
        sales: [],
        totalOwedUsd: 0,
        totalOwedBs: null,
        oldestAt: s.createdAt,
      }
      byCustomer.set(key, group)
    }
    group.sales.push(s)
    group.totalOwedUsd = Math.round((group.totalOwedUsd + s.balanceUsd) * 100) / 100
    if (s.balanceBs != null) {
      group.totalOwedBs =
        Math.round(((group.totalOwedBs ?? 0) + s.balanceBs) * 100) / 100
    }
    grandUsd = Math.round((grandUsd + s.balanceUsd) * 100) / 100
    if (s.balanceBs != null) {
      grandBs = Math.round((grandBs + s.balanceBs) * 100) / 100
      hasBs = true
    }
    if (s.bsRate) bsRate = s.bsRate
  }

  const customers = [...byCustomer.values()].sort(
    (a, b) => new Date(a.oldestAt).getTime() - new Date(b.oldestAt).getTime(),
  )

  return {
    totalOwedUsd: grandUsd,
    totalOwedBs: hasBs ? grandBs : null,
    bsRate,
    customers,
  }
}

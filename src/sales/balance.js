export const PAYMENT_TOLERANCE = Number(process.env.PAYMENT_TOLERANCE ?? 0.1)

/**
 * @param {number} n
 */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/**
 * @param {{ totalUsd: number|string|{toNumber?:()=>number}, payments?: Array<{ amountUsd: number|string|{toNumber?:()=>number} }> }} sale
 */
export function balanceUsdOf(sale) {
  const total = toNum(sale.totalUsd)
  const paid = (sale.payments ?? []).reduce((sum, p) => sum + toNum(p.amountUsd), 0)
  return round2(total - paid)
}

/**
 * @param {number} balanceUsd
 */
export function isSettled(balanceUsd) {
  return Math.abs(balanceUsd) <= PAYMENT_TOLERANCE
}

/**
 * Absorbe centavos de redondeo Bs↔USD: si el pago casi cubre el saldo,
 * acredita exactamente `balance` para que el libro quede en $0.
 * Overpay > tolerancia no se toca aquí (addPayment lo rechaza antes).
 *
 * @param {number} amountUsd
 * @param {number} balance
 */
export function settleCreditUsd(amountUsd, balance) {
  if (amountUsd > balance + PAYMENT_TOLERANCE) return amountUsd
  if (balance - amountUsd <= PAYMENT_TOLERANCE) return balance
  return amountUsd
}

/**
 * Punto único de saldos para lista, detalle, pago y receivables.
 * Lazy-import de rates para que los tests de dominio no toquen Redis.
 * @param {{ totalUsd: *, payments?: *[] }} sale
 * @param {(source: string) => Promise<{ rate: number, fetchedAt: string }|null>} [readRateFn]
 * @returns {Promise<{ balanceUsd: number, balanceBs: number|null, bsRate: { rate: number, fetchedAt: string }|null }>}
 */
export async function balanceView(sale, readRateFn) {
  const balanceUsd = balanceUsdOf(sale)
  const readRate = readRateFn ?? (await import('../rates/store.js')).readRate
  const bsRate = await readRate('BCV')
  if (!bsRate || !(bsRate.rate > 0)) {
    return { balanceUsd, balanceBs: null, bsRate: null }
  }
  return {
    balanceUsd,
    balanceBs: round2(balanceUsd * bsRate.rate),
    bsRate: { rate: bsRate.rate, fetchedAt: bsRate.fetchedAt },
  }
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

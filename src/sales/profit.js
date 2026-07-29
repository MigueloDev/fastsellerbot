import { round2 } from './balance.js'

function toNum(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Ganancia bruta de una venta a partir del snapshot de costo en ítems.
 * Si falta unitCostUsd en algún ítem → costUsd/profitUsd/marginPct = null.
 *
 * @param {{ totalUsd: *, items?: Array<{ quantity: number, unitCostUsd?: * }> }} sale
 * @returns {{ costUsd: number|null, profitUsd: number|null, marginPct: number|null }}
 */
export function saleProfitOf(sale) {
  const items = sale.items ?? []
  if (items.length === 0) {
    return { costUsd: null, profitUsd: null, marginPct: null }
  }

  let costUsd = 0
  for (const it of items) {
    const unitCost = toNum(it.unitCostUsd)
    if (unitCost == null || !(unitCost >= 0)) {
      return { costUsd: null, profitUsd: null, marginPct: null }
    }
    costUsd += it.quantity * unitCost
  }
  costUsd = round2(costUsd)
  const totalUsd = round2(toNum(sale.totalUsd) ?? 0)
  const profitUsd = round2(totalUsd - costUsd)
  const marginPct = totalUsd > 0 ? round2((profitUsd / totalUsd) * 100) : null
  return { costUsd, profitUsd, marginPct }
}

/**
 * Ganancia realizada al convertir Bs de una venta a USDT.
 * profitUsd = usdtReceived + usdCollected − costUsd
 * Si costUsd es null → profitUsd null.
 *
 * @param {{ usdtReceived: number, usdCollected?: number, costUsd?: number|null }} input
 */
export function currencyPurchaseProfitOf({ usdtReceived, usdCollected = 0, costUsd = null }) {
  const usdt = Number(usdtReceived)
  const usd = Number(usdCollected) || 0
  if (!Number.isFinite(usdt) || !(usdt > 0)) {
    return { profitUsd: null }
  }
  if (costUsd == null || !Number.isFinite(Number(costUsd))) {
    return { profitUsd: null }
  }
  return { profitUsd: round2(usdt + usd - Number(costUsd)) }
}

/**
 * USDT esperados según tasa Binance ingresada: bsSpent / binanceRate.
 * @param {number} bsSpent
 * @param {number} binanceRate
 */
export function expectedUsdt(bsSpent, binanceRate) {
  const bs = Number(bsSpent)
  const rate = Number(binanceRate)
  if (!Number.isFinite(bs) || !(bs > 0) || !Number.isFinite(rate) || !(rate > 0)) {
    return null
  }
  // ponytail: 6 decimales USDT; upgrade a Decimal si aparece ledger de egresos
  return Math.round((bs / rate) * 1e6) / 1e6
}

/**
 * Suma pagos BS y USD de una venta.
 * @param {Array<{ currency: string, amount: *, amountUsd: * }>} payments
 */
export function paymentCurrencyTotals(payments = []) {
  let bsSpent = 0
  let usdCollected = 0
  for (const p of payments) {
    if (p.currency === 'BS') bsSpent += toNum(p.amount) ?? 0
    else if (p.currency === 'USD') usdCollected += toNum(p.amountUsd) ?? toNum(p.amount) ?? 0
  }
  return {
    bsSpent: round2(bsSpent),
    usdCollected: round2(usdCollected),
  }
}

/**
 * Suma montos ya atribuidos en compras de divisas de una venta.
 * @param {Array<{ bsSpent?: *, usdCollected?: *, usdtReceived?: * }>} purchases
 */
export function purchaseCurrencyTotals(purchases = []) {
  let bsSpent = 0
  let usdCollected = 0
  let usdtReceived = 0
  for (const p of purchases) {
    bsSpent += toNum(p.bsSpent) ?? 0
    usdCollected += toNum(p.usdCollected) ?? 0
    usdtReceived += toNum(p.usdtReceived) ?? 0
  }
  return {
    bsSpent: round2(bsSpent),
    usdCollected: round2(usdCollected),
    // ponytail: 6 dp USDT; upgrade si el ledger de egresos exige Decimal
    usdtReceived: Math.round(usdtReceived * 1e6) / 1e6,
  }
}

/**
 * Bs/USD aún no convertidos o atribuidos a compras previas.
 * `purchases` puede ser CurrencyPurchase[] o CurrencyPurchaseAllocation[]
 * (misma forma: bsSpent / usdCollected / usdtReceived).
 *
 * @param {Array<{ currency: string, amount: *, amountUsd: * }>} payments
 * @param {Array<{ bsSpent?: *, usdCollected?: *, usdtReceived?: * }>} purchases
 */
export function fxAvailability(payments = [], purchases = []) {
  const paid = paymentCurrencyTotals(payments)
  const spent = purchaseCurrencyTotals(purchases)
  return {
    totalBs: paid.bsSpent,
    totalUsdCollected: paid.usdCollected,
    bsConverted: spent.bsSpent,
    usdAttributed: spent.usdCollected,
    usdtReceived: spent.usdtReceived,
    bsAvailable: round2(paid.bsSpent - spent.bsSpent),
    usdAvailable: round2(paid.usdCollected - spent.usdCollected),
  }
}

/**
 * Reparte usdtTotal proporcional a bsAmounts; la última fila absorbe el residuo (6 dp).
 * @param {number[]} bsAmounts
 * @param {number} usdtTotal
 * @returns {number[]}
 */
export function allocateUsdt(bsAmounts = [], usdtTotal) {
  const amounts = bsAmounts.map((v) => Number(v) || 0)
  const usdt = Math.round(Number(usdtTotal) * 1e6) / 1e6
  if (!amounts.length || !(usdt > 0)) return amounts.map(() => 0)

  const totalBs = amounts.reduce((a, b) => a + b, 0)
  if (!(totalBs > 0)) return amounts.map(() => 0)

  const shares = []
  let allocated = 0
  for (let i = 0; i < amounts.length; i++) {
    if (i === amounts.length - 1) {
      shares.push(Math.round((usdt - allocated) * 1e6) / 1e6)
    } else {
      const share = Math.round(((usdt * amounts[i]) / totalBs) * 1e6) / 1e6
      shares.push(share)
      allocated = Math.round((allocated + share) * 1e6) / 1e6
    }
  }
  return shares
}

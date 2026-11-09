import { round2 } from './balance.js'
import { saleProfitOf } from './profit.js'

function num(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Ventana inmediatamente anterior, del mismo largo. Sin from/to no hay contra qué comparar.
 * @param {{ from?: Date, to?: Date }} range
 * @returns {{ from: Date, to: Date } | null}
 */
export function previousWindow(range) {
  if (!range?.from || !range?.to) return null
  const ms = range.to.getTime() - range.from.getTime()
  if (!(ms > 0)) return null
  const to = new Date(range.from.getTime() - 1)
  return { from: new Date(to.getTime() - ms), to }
}

/**
 * Ganancia del período = suma de saleProfitOf. Una venta sin costo no anula el resto:
 * queda en unknownCount y fuera del total.
 * @param {Array<Parameters<typeof saleProfitOf>[0]>} sales
 */
export function summarizeProfit(sales) {
  let profit = 0
  let knownTotal = 0
  let knownCount = 0
  let unknownCount = 0
  for (const sale of sales) {
    const row = saleProfitOf(sale)
    if (row.profitUsd == null) {
      unknownCount++
      continue
    }
    knownCount++
    profit += row.profitUsd
    knownTotal += num(sale.totalUsd)
  }
  const totalUsd = knownCount > 0 ? round2(profit) : null
  const base = round2(knownTotal)
  return {
    totalUsd,
    marginPct: totalUsd != null && base > 0 ? round2((totalUsd / base) * 100) : null,
    knownCount,
    unknownCount,
  }
}

export function sumTotalUsd(sales) {
  return round2(sales.reduce((sum, sale) => sum + num(sale.totalUsd), 0))
}

/**
 * Top por unidades. Ganancia de la línea = subtotal − cantidad × costo.
 * Si alguna línea del grupo no tiene costo, profitUsd es null.
 * No reparte gastos de la venta: esos viven en summarizeProfit.
 * @param {Array<{ items?: Array<{ productId: string, variantId?: string|null, quantity: number, unitCostUsd?: *, subtotalUsd?: * }> }>} sales
 * @param {number} [limit]
 */
export function topProductLines(sales, limit = 5) {
  /** @type {Map<string, { productId: string, variantId: string|null, unitsSold: number, revenueUsd: number, costUsd: number, missingCost: boolean }>} */
  const map = new Map()
  for (const sale of sales) {
    for (const it of sale.items ?? []) {
      const variantId = it.variantId ?? null
      const key = `${it.productId}\0${variantId ?? ''}`
      let row = map.get(key)
      if (!row) {
        row = {
          productId: it.productId,
          variantId,
          unitsSold: 0,
          revenueUsd: 0,
          costUsd: 0,
          missingCost: false,
        }
        map.set(key, row)
      }
      row.unitsSold += it.quantity
      row.revenueUsd += num(it.subtotalUsd)
      if (it.unitCostUsd == null) row.missingCost = true
      else row.costUsd += it.quantity * num(it.unitCostUsd)
    }
  }
  return [...map.values()]
    .sort((a, b) => b.unitsSold - a.unitsSold || b.revenueUsd - a.revenueUsd)
    .slice(0, limit)
    .map((row) => ({
      productId: row.productId,
      variantId: row.variantId,
      unitsSold: row.unitsSold,
      revenueUsd: round2(row.revenueUsd),
      profitUsd: row.missingCost ? null : round2(row.revenueUsd - row.costUsd),
    }))
}

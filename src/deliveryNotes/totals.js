/**
 * Dominio puro de totales / visibilidad de nota de entrega.
 */

import { round2 } from '../sales/balance.js'

/**
 * @param {Array<{ subtotalUsd: number }>} items
 */
export function totalUsdOf(items) {
  return round2((items ?? []).reduce((s, it) => s + Number(it.subtotalUsd || 0), 0))
}

/**
 * Campos monetarios visibles según showValue (print / list UI).
 * @param {boolean} showValue
 * @param {{ unitPriceUsd: number, subtotalUsd: number, totalUsd: number }} amounts
 */
export function visibleMoneyFields(showValue, amounts) {
  if (showValue) {
    return {
      unitPriceUsd: amounts.unitPriceUsd,
      subtotalUsd: amounts.subtotalUsd,
      totalUsd: amounts.totalUsd,
    }
  }
  return {
    unitPriceUsd: null,
    subtotalUsd: null,
    totalUsd: null,
  }
}

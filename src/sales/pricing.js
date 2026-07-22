/**
 * Dominio puro de precios por cantidad (tiers vía ProductPrice.minQty).
 *
 * Regla: entre precios activos del mismo ref, gana el mayor minQty ≤ qty.
 * La qty es la suma de todas las líneas del mismo producto en la venta
 * (variantes incluidas).
 */

/**
 * @param {Array<{ ref: string, amount: number|string|{toNumber?:()=>number}, minQty?: number, active?: boolean }>} prices
 * @param {'REF_USD'|'REF_BS'} ref
 * @param {number} qty
 * @returns {number|null} amount o null si no hay nivel aplicable
 */
export function pickTierPrice(prices, ref, qty) {
  if (!Array.isArray(prices) || !Number.isFinite(qty) || qty < 1) return null
  const candidates = prices
    .filter((p) => p && p.ref === ref && p.active !== false)
    .filter((p) => (p.minQty ?? 1) <= qty)
  if (candidates.length === 0) return null

  let best = candidates[0]
  for (let i = 1; i < candidates.length; i++) {
    const cur = candidates[i]
    if ((cur.minQty ?? 1) > (best.minQty ?? 1)) best = cur
  }
  return toAmount(best.amount)
}

/**
 * Suma cantidades por productId (todas las líneas / variantes).
 * @param {Array<{ productId: string, quantity: number }>} items
 * @returns {Map<string, number>}
 */
export function qtyByProduct(items) {
  const map = new Map()
  for (const it of items ?? []) {
    if (!it?.productId) continue
    const q = Number(it.quantity) || 0
    map.set(it.productId, (map.get(it.productId) ?? 0) + q)
  }
  return map
}

function toAmount(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'object' && typeof v.toNumber === 'function') {
    const n = v.toNumber()
    return Number.isFinite(n) ? n : null
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

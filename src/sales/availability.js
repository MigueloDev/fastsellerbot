/**
 * Dominio puro de disponibilidad de inventario.
 *
 * Modelo: una venta POR_ENTREGAR *reserva* (compromete) unidades sin escribir
 * SALIDA en el ledger. El stock físico (`StockLevel.quantity`) solo baja al
 * entregar. Lo que se puede vender es `onHand - committed`.
 */

/** Clave canónica de un nivel de stock (producto + variante opcional). */
export function levelKey(productId, variantId) {
  return `${productId}|${variantId ?? ''}`
}

/**
 * Unidades vendibles: físico menos lo comprometido por ventas sin entregar.
 * @param {number} onHand
 * @param {number} committed
 */
export function availableQty(onHand, committed = 0) {
  return (onHand ?? 0) - (committed ?? 0)
}

/**
 * @param {{ onHand: number, committed?: number, requested: number }} input
 * @returns {{ ok: boolean, available: number }}
 */
export function checkAvailability({ onHand, committed = 0, requested }) {
  const available = availableQty(onHand, committed)
  return { ok: available >= requested, available }
}

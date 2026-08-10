/**
 * Estado de cobro derivado (no vive en schema).
 * @typedef {'PAGADA' | 'ABONADA' | 'CREDITO'} PaymentState
 */

/**
 * @param {{ status: string, paymentsCount?: number }} sale
 * @returns {PaymentState | null} null si ANULADA u otro status desconocido
 */
export function paymentStateOf(sale) {
  if (sale.status === 'PAGADA') return 'PAGADA'
  if (sale.status === 'PENDIENTE') {
    return (sale.paymentsCount ?? 0) > 0 ? 'ABONADA' : 'CREDITO'
  }
  return null
}

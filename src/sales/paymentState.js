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

/**
 * Traduce un CSV de filtros de cobro (status del schema + estados derivados)
 * a una lista de condiciones Prisma para `OR`. `ABONADA`/`CREDITO` no viven
 * en el schema, se derivan de PENDIENTE + si tiene pagos.
 * @param {string | undefined} csv ej. "PAGADA,ABONADA"
 * @returns {object[] | undefined} condiciones para `where.OR`; undefined si no hay filtro válido
 */
export function paymentStatesWhere(csv) {
  if (!csv) return undefined
  const values = csv.split(',').map((v) => v.trim())
  const conditions = []
  for (const value of values) {
    if (value === 'PAGADA') conditions.push({ status: 'PAGADA' })
    else if (value === 'ANULADA') conditions.push({ status: 'ANULADA' })
    else if (value === 'PENDIENTE') conditions.push({ status: 'PENDIENTE' })
    else if (value === 'ABONADA')
      conditions.push({ status: 'PENDIENTE', payments: { some: {} } })
    else if (value === 'CREDITO')
      conditions.push({ status: 'PENDIENTE', payments: { none: {} } })
  }
  return conditions.length > 0 ? conditions : undefined
}

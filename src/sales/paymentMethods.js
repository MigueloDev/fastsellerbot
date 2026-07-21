/** @typedef {'REF_USD'|'REF_BS'} PriceRef */
/** @typedef {'USD'|'BS'} PaymentCurrency */

/**
 * Fuente única: método → moneda → priceRef esperado.
 * Agregar un método = una línea aquí + valor al enum Prisma.
 */
export const PAYMENT_METHODS = {
  EFECTIVO_USD: { currency: 'USD', priceRef: 'REF_USD', label: 'Efectivo USD' },
  ZELLE: { currency: 'USD', priceRef: 'REF_USD', label: 'Zelle' },
  USDT: { currency: 'USD', priceRef: 'REF_USD', label: 'USDT' },
  PAGO_MOVIL: { currency: 'BS', priceRef: 'REF_BS', label: 'Pago móvil' },
  TRANSFERENCIA: { currency: 'BS', priceRef: 'REF_BS', label: 'Transferencia' },
  PUNTO: { currency: 'BS', priceRef: 'REF_BS', label: 'Punto de venta' },
  EFECTIVO_BS: { currency: 'BS', priceRef: 'REF_BS', label: 'Efectivo Bs' },
}

export const PAYMENT_METHOD_KEYS = Object.keys(PAYMENT_METHODS)

/**
 * @param {string} method
 * @returns {PaymentCurrency}
 */
export function currencyFor(method) {
  const entry = PAYMENT_METHODS[method]
  if (!entry) throw new Error(`Método de pago inválido: ${method}`)
  return entry.currency
}

/**
 * @param {string} method
 * @param {PriceRef} priceRef
 */
export function matchesPriceRef(method, priceRef) {
  const entry = PAYMENT_METHODS[method]
  if (!entry) return false
  return entry.priceRef === priceRef
}

import { round2 } from './balance.js'

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

/**
 * Totales por método de pago, en el orden de `PAYMENT_METHOD_KEYS`; solo
 * métodos con al menos un pago. `amount` va en la moneda del método.
 *
 * @param {Array<{ method: string, currency: PaymentCurrency, amount: number, amountUsd: number }>} payments
 */
export function summarizeByMethod(payments) {
  /** @type {Record<string, { method: string, currency: PaymentCurrency, count: number, amount: number, amountUsd: number }>} */
  const out = {}
  for (const p of payments) {
    const bucket = (out[p.method] ??= {
      method: p.method,
      currency: p.currency,
      count: 0,
      amount: 0,
      amountUsd: 0,
    })
    bucket.count += 1
    bucket.amount = round2(bucket.amount + p.amount)
    bucket.amountUsd = round2(bucket.amountUsd + p.amountUsd)
  }
  return PAYMENT_METHOD_KEYS.filter((k) => out[k]).map((k) => out[k])
}

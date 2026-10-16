import { round2 } from '../sales/balance.js'

export class CashError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'CashError'
    this.status = status
  }
}

const TYPES = new Set(['ENTRADA', 'SALIDA', 'AJUSTE'])
const REASONS = new Set(['MANUAL', 'GASTO', 'PRESTAMO'])

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

function normalizeReason(input, type) {
  const reason =
    input?.reason == null || input.reason === '' ? 'MANUAL' : input.reason
  if (!REASONS.has(reason)) {
    throw new CashError(422, `reason inválido: ${reason}`)
  }
  if (type === 'AJUSTE' && reason !== 'MANUAL') {
    throw new CashError(422, 'AJUSTE solo admite reason MANUAL')
  }
  if (reason === 'GASTO' && type !== 'SALIDA') {
    throw new CashError(422, 'GASTO requiere type SALIDA')
  }
  if (reason === 'PRESTAMO' && type !== 'SALIDA' && type !== 'ENTRADA') {
    throw new CashError(422, 'PRESTAMO requiere type ENTRADA o SALIDA')
  }
  if (reason === 'PRESTAMO') {
    const note = typeof input.note === 'string' ? input.note.trim() : ''
    if (!note) {
      throw new CashError(422, 'PRESTAMO requiere nota (a quién / de quién)')
    }
  }
  return reason
}

/**
 * @param {{ type: string, amount?: number, delta?: number, reason?: string, note?: string|null }} input
 * @returns {{ type: string, reason: string, amount: number, delta: number }}
 */
export function normalizeCashMovement(input) {
  const type = input?.type
  if (!TYPES.has(type)) {
    throw new CashError(422, `type inválido: ${type}`)
  }
  const reason = normalizeReason(input, type)

  if (type === 'AJUSTE') {
    const raw = Number(input.delta)
    if (!Number.isFinite(raw) || raw === 0) {
      throw new CashError(422, 'AJUSTE requiere delta distinto de 0')
    }
    const delta = round2(raw)
    if (delta === 0) {
      throw new CashError(422, 'AJUSTE requiere delta distinto de 0')
    }
    return { type, reason, amount: Math.abs(delta), delta }
  }

  const raw = Number(input.amount)
  if (!Number.isFinite(raw) || !(raw > 0)) {
    throw new CashError(422, `${type} requiere amount > 0`)
  }
  const amount = round2(raw)
  if (!(amount > 0)) {
    throw new CashError(422, `${type} requiere amount > 0`)
  }
  return { type, reason, amount, delta: type === 'ENTRADA' ? amount : -amount }
}

/**
 * @param {number|string|{toNumber?:()=>number}} balance
 * @param {number} delta
 */
export function nextBalance(balance, delta) {
  // ponytail: saldo negativo = deuda con uno mismo (lo que falta reponer). Sin piso en 0.
  return round2(toNum(balance) + Number(delta))
}

/**
 * @param {Array<{ active?: boolean, currency?: string }>} accounts
 * @param {string} currency
 */
export function pickDefaultAccount(accounts, currency) {
  const matches = (accounts ?? []).filter(
    (a) => a.active && a.currency === currency,
  )
  return matches.length === 1 ? matches[0] : null
}

/**
 * @param {{ active?: boolean, currency?: string }|null|undefined} account
 * @param {string} paymentCurrency
 */
export function assertAccountForPayment(account, paymentCurrency) {
  if (!account) throw new CashError(422, 'Cuenta no encontrada')
  if (!account.active) throw new CashError(422, 'Cuenta inactiva')
  if (account.currency !== paymentCurrency) {
    throw new CashError(422, 'La cuenta no coincide con la moneda del pago')
  }
}

/**
 * @param {{ active?: boolean, currency?: string }|null|undefined} from
 * @param {{ active?: boolean, currency?: string }|null|undefined} to
 */
export function assertAccountsForConversion(from, to) {
  if (!from) throw new CashError(422, 'Cuenta de origen no encontrada')
  if (!to) throw new CashError(422, 'Cuenta de destino no encontrada')
  if (!from.active) throw new CashError(422, 'Cuenta de origen inactiva')
  if (!to.active) throw new CashError(422, 'Cuenta de destino inactiva')
  if (from.currency !== 'BS') {
    throw new CashError(422, 'La cuenta de origen debe ser en Bs')
  }
  if (to.currency !== 'USD') {
    throw new CashError(422, 'La cuenta de destino debe ser en USD')
  }
}

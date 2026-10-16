import {
  CashError,
  normalizeCashMovement,
  nextBalance,
} from './movement.js'

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

/**
 * Lock cuenta FOR UPDATE, append movimiento, actualiza balance.
 *
 * @param {any} tx
 * @param {{
 *   accountId: string,
 *   type: string,
 *   amount?: number,
 *   delta?: number,
 *   reason?: string,
 *   note?: string|null,
 *   agentName?: string|null,
 *   paymentId?: string|null,
 *   currencyPurchaseId?: string|null,
 * }} input
 */
export async function applyCashMovementInTx(tx, input) {
  const accountId = input?.accountId
  if (!accountId) throw new CashError(422, 'accountId es requerido')

  const norm = normalizeCashMovement(input)

  const rows = await tx.$queryRaw`
    SELECT id, balance FROM cash_accounts WHERE id = ${accountId} FOR UPDATE
  `
  if (!rows.length) throw new CashError(422, 'Cuenta no encontrada')

  const next = nextBalance(rows[0].balance, norm.delta)

  const movement = await tx.cashMovement.create({
    data: {
      accountId,
      type: norm.type,
      reason: norm.reason,
      amount: norm.amount,
      delta: norm.delta,
      note: input.note?.trim() || null,
      agentName: input.agentName ?? null,
      paymentId: input.paymentId ?? null,
      currencyPurchaseId: input.currencyPurchaseId ?? null,
    },
  })

  const account = await tx.cashAccount.update({
    where: { id: accountId },
    data: { balance: next },
  })

  return { movement, account, balance: toNum(account.balance) }
}

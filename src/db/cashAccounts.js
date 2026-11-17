import { prisma } from './client.js'
import { applyCashMovementInTx } from '../cash/apply.js'
import {
  CashError,
  assertAccountsForTransfer,
  computeTransfer,
} from '../cash/movement.js'

const CURRENCIES = new Set(['USD', 'BS'])

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

function serializeAccount(row) {
  if (!row) return null
  return {
    id: row.id,
    alias: row.alias,
    institution: row.institution,
    holder: row.holder,
    currency: row.currency,
    balance: toNum(row.balance),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function serializeMovement(row, runningBalance = null) {
  if (!row) return null
  return {
    id: row.id,
    accountId: row.accountId,
    type: row.type,
    reason: row.reason,
    amount: toNum(row.amount),
    delta: toNum(row.delta),
    note: row.note,
    agentName: row.agentName,
    paymentId: row.paymentId,
    currencyPurchaseId: row.currencyPurchaseId,
    transferId: row.transferId,
    createdAt: row.createdAt,
    ...(runningBalance != null ? { balance: runningBalance } : {}),
  }
}

function requiredTrim(value, field) {
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) throw new CashError(422, `${field} es requerido`)
  return s
}

function assertCurrency(currency) {
  if (!CURRENCIES.has(currency)) {
    throw new CashError(422, `currency inválida: ${currency}`)
  }
  return currency
}

function dateWhere({ from, to }) {
  if (!from && !to) return {}
  /** @type {{ gte?: Date, lte?: Date }} */
  const clause = {}
  if (from) clause.gte = from
  if (to) clause.lte = to
  return { createdAt: clause }
}

async function uniqueAliasOrThrow(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err.code === 'P2002') {
      throw new CashError(409, 'alias ya existe')
    }
    throw err
  }
}

export async function listCashAccounts() {
  const rows = await prisma.cashAccount.findMany({
    orderBy: [{ active: 'desc' }, { currency: 'asc' }, { alias: 'asc' }],
  })
  return rows.map(serializeAccount)
}

/**
 * @param {{ alias: string, institution: string, holder: string, currency: string }} data
 */
export async function createCashAccount(data) {
  const alias = requiredTrim(data.alias, 'alias')
  const institution = requiredTrim(data.institution, 'institution')
  const holder = requiredTrim(data.holder, 'holder')
  const currency = assertCurrency(data.currency)

  const row = await uniqueAliasOrThrow(() =>
    prisma.cashAccount.create({
      data: { alias, institution, holder, currency },
    }),
  )
  return serializeAccount(row)
}

/**
 * @param {string} id
 * @param {{ alias?: string, institution?: string, holder?: string, active?: boolean, currency?: string }} data
 */
export async function updateCashAccount(id, data) {
  const existing = await prisma.cashAccount.findUnique({ where: { id } })
  if (!existing) throw new CashError(404, 'Cuenta no encontrada')

  /** @type {Record<string, unknown>} */
  const patch = {}
  if (data.alias !== undefined) patch.alias = requiredTrim(data.alias, 'alias')
  if (data.institution !== undefined) {
    patch.institution = requiredTrim(data.institution, 'institution')
  }
  if (data.holder !== undefined) patch.holder = requiredTrim(data.holder, 'holder')
  if (data.active !== undefined) patch.active = Boolean(data.active)

  if (data.currency !== undefined && data.currency !== existing.currency) {
    const currency = assertCurrency(data.currency)
    const count = await prisma.cashMovement.count({ where: { accountId: id } })
    if (count > 0) {
      throw new CashError(409, 'No se puede cambiar la moneda de una cuenta con movimientos')
    }
    patch.currency = currency
  }

  if (Object.keys(patch).length === 0) return serializeAccount(existing)

  const row = await uniqueAliasOrThrow(() =>
    prisma.cashAccount.update({ where: { id }, data: patch }),
  )
  return serializeAccount(row)
}

/**
 * @param {string} id
 * @param {{ from?: Date, to?: Date, limit?: number, offset?: number }} opts
 */
export async function getCashAccount(id, { from, to, limit = 100, offset = 0 } = {}) {
  const account = await prisma.cashAccount.findUnique({ where: { id } })
  if (!account) throw new CashError(404, 'Cuenta no encontrada')

  const take = Math.min(Math.max(Number(limit) || 100, 1), 500)
  const skip = Math.max(Number(offset) || 0, 0)
  const range = dateWhere({ from, to })

  const rangeWhere = { accountId: id, ...range }
  const [openingAgg, skipped, rows, total, gastosAgg, prestamosOutAgg, prestamosInAgg, entradasAgg, salidasAgg, periodDeltaAgg] =
    await Promise.all([
    from
      ? prisma.cashMovement.aggregate({
          where: { accountId: id, createdAt: { lt: from } },
          _sum: { delta: true },
        })
      : Promise.resolve({ _sum: { delta: 0 } }),
    skip > 0
      ? prisma.cashMovement.findMany({
          where: rangeWhere,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: skip,
          select: { delta: true },
        })
      : Promise.resolve([]),
    prisma.cashMovement.findMany({
      where: rangeWhere,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
    }),
    prisma.cashMovement.count({ where: rangeWhere }),
    prisma.cashMovement.aggregate({
      where: { ...rangeWhere, reason: 'GASTO' },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { ...rangeWhere, reason: 'PRESTAMO', type: 'SALIDA' },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { ...rangeWhere, reason: 'PRESTAMO', type: 'ENTRADA' },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { ...rangeWhere, type: 'ENTRADA' },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({
      where: { ...rangeWhere, type: 'SALIDA' },
      _sum: { amount: true },
    }),
    prisma.cashMovement.aggregate({
      where: rangeWhere,
      _sum: { delta: true },
    }),
  ])

  const opening = roundDelta(openingAgg._sum.delta)
  let running = opening + skipped.reduce((sum, m) => sum + toNum(m.delta), 0)
  running = Math.round((running + Number.EPSILON) * 100) / 100

  const movements = rows.map((row) => {
    running = Math.round((running + toNum(row.delta) + Number.EPSILON) * 100) / 100
    return serializeMovement(row, running)
  })

  const entradas = roundDelta(entradasAgg._sum.amount)
  const salidas = roundDelta(salidasAgg._sum.amount)

  return {
    ...serializeAccount(account),
    opening,
    closing: roundDelta(opening + toNum(periodDeltaAgg._sum.delta)),
    movements,
    totals: {
      entradas,
      salidas,
      gastos: roundDelta(gastosAgg._sum.amount),
      prestamosOtorgados: roundDelta(prestamosOutAgg._sum.amount),
      prestamosCobrados: roundDelta(prestamosInAgg._sum.amount),
    },
    total,
    limit: take,
    offset: skip,
  }
}

function roundDelta(v) {
  return Math.round((toNum(v) + Number.EPSILON) * 100) / 100
}

/**
 * @param {string} accountId
 * @param {{ type: string, amount?: number, delta?: number, reason?: string, note?: string|null, agentName?: string|null }} input
 */
export async function createCashMovement(accountId, input) {
  const { movement, account } = await prisma.$transaction((tx) =>
    applyCashMovementInTx(tx, {
      accountId,
      type: input.type,
      amount: input.amount,
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      agentName: input.agentName,
    }),
  )
  return {
    account: serializeAccount(account),
    movement: serializeMovement(movement, toNum(account.balance)),
  }
}

function serializeTransfer(row) {
  return {
    id: row.id,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amountSent: toNum(row.amountSent),
    feePercent: toNum(row.feePercent),
    amountReceived: toNum(row.amountReceived),
    note: row.note,
    agentName: row.agentName,
    createdAt: row.createdAt,
  }
}

/**
 * SALIDA en origen por amountSent + ENTRADA en destino por el neto, en una sola tx.
 *
 * @param {{ fromAccountId: string, toAccountId: string, amountSent: number, feePercent?: number|null, note?: string|null, agentName?: string|null }} input
 */
export async function createCashTransfer(input) {
  const calc = computeTransfer(input)
  const note = input.note?.trim() || null

  const result = await prisma.$transaction(async (tx) => {
    // Lock ambas cuentas en orden fijo: A→B y B→A concurrentes no se bloquean mutuamente.
    const ids = [input.fromAccountId, input.toAccountId].sort()
    await tx.$queryRaw`
      SELECT id FROM cash_accounts WHERE id IN (${ids[0]}, ${ids[1]}) ORDER BY id FOR UPDATE
    `
    const [from, to] = await Promise.all([
      tx.cashAccount.findUnique({ where: { id: input.fromAccountId } }),
      tx.cashAccount.findUnique({ where: { id: input.toAccountId } }),
    ])
    assertAccountsForTransfer(from, to)

    const transfer = await tx.cashTransfer.create({
      data: {
        fromAccountId: from.id,
        toAccountId: to.id,
        amountSent: calc.amountSent,
        feePercent: calc.feePercent,
        amountReceived: calc.amountReceived,
        note,
        agentName: input.agentName ?? null,
      },
    })

    const feeLabel = calc.feePercent > 0 ? ` (${calc.feePercent}% comisión)` : ''
    const suffix = note ? ` · ${note}` : ''
    const out = await applyCashMovementInTx(tx, {
      accountId: from.id,
      type: 'SALIDA',
      amount: calc.amountSent,
      note: `Transferencia a ${to.alias}${feeLabel}${suffix}`,
      agentName: input.agentName,
      transferId: transfer.id,
    })
    const inn = await applyCashMovementInTx(tx, {
      accountId: to.id,
      type: 'ENTRADA',
      amount: calc.amountReceived,
      note: `Transferencia desde ${from.alias}${feeLabel}${suffix}`,
      agentName: input.agentName,
      transferId: transfer.id,
    })
    return { transfer, from: out.account, to: inn.account }
  })

  return {
    transfer: serializeTransfer(result.transfer),
    from: serializeAccount(result.from),
    to: serializeAccount(result.to),
  }
}

export { CashError }

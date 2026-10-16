import {
  listCashAccounts,
  createCashAccount,
  updateCashAccount,
  getCashAccount,
  createCashMovement,
  CashError,
} from '../../db/cashAccounts.js'
import { parseRange } from '../queryRange.js'

function agentNameOf(request) {
  return request.user?.name ?? 'Agente'
}

function handleError(err, reply) {
  if (err instanceof CashError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

export async function list(request, reply) {
  try {
    return await listCashAccounts()
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function create(request, reply) {
  try {
    const account = await createCashAccount(request.body)
    reply.status(201).send(account)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function get(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(422).send({ error: range.error })
      return
    }
    const { limit, offset } = request.query ?? {}
    return await getCashAccount(request.params.id, {
      from: range.from,
      to: range.to,
      limit: limit != null ? Number(limit) : 100,
      offset: offset != null ? Number(offset) : 0,
    })
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function patch(request, reply) {
  try {
    return await updateCashAccount(request.params.id, request.body)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function createMovement(request, reply) {
  try {
    const result = await createCashMovement(request.params.id, {
      type: request.body.type,
      amount: request.body.amount,
      delta: request.body.delta,
      reason: request.body.reason,
      note: request.body.note,
      agentName: agentNameOf(request),
    })
    reply.status(201).send(result)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

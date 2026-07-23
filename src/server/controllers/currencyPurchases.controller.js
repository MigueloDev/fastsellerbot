import {
  listCurrencyPurchases,
  listEligibleSales,
  createCurrencyPurchase,
  CurrencyPurchaseError,
} from '../../db/currencyPurchases.js'

function agentNameOf(request) {
  return request.user?.name ?? 'Agente'
}

function handleError(err, reply) {
  if (err instanceof CurrencyPurchaseError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

export async function list(request, reply) {
  try {
    const { limit, offset } = request.query ?? {}
    return await listCurrencyPurchases({
      limit: limit != null ? Number(limit) : 50,
      offset: offset != null ? Number(offset) : 0,
    })
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function eligible(request, reply) {
  try {
    const { limit } = request.query ?? {}
    const items = await listEligibleSales({
      limit: limit != null ? Number(limit) : 50,
    })
    return { items }
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function create(request, reply) {
  try {
    const body = request.body ?? {}
    const purchase = await createCurrencyPurchase({
      saleId: body.saleId,
      binanceRate: body.binanceRate,
      usdtReceived: body.usdtReceived,
      note: body.note,
      agentName: agentNameOf(request),
    })
    reply.status(201).send(purchase)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

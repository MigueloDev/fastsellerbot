import {
  createSale,
  updateSale,
  addPayment,
  voidSale,
  deliverSale,
  undeliverSale,
  findSale,
  listSales,
  listReceivables,
  SaleError,
} from '../../db/sales.js'
import { StockError } from '../../db/stock.js'
import { balanceView } from '../../sales/balance.js'
import { matchesPriceRef } from '../../sales/paymentMethods.js'
import { summarizeReceivables } from '../../sales/receivablesSummary.js'

function agentNameOf(request) {
  return request.user?.name ?? 'Agente'
}

function handleError(err, reply) {
  if (err instanceof SaleError || err instanceof StockError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

/**
 * Shape único: venta + saldo USD/Bs + alerta mismatch.
 * @param {object} sale
 */
export async function saleResponse(sale) {
  const bal = await balanceView(sale)
  const paymentMismatch = (sale.payments ?? []).some(
    (p) => !matchesPriceRef(p.method, sale.priceRef),
  )
  return {
    ...sale,
    ...bal,
    paymentMismatch,
  }
}

export async function list(request, reply) {
  try {
    const { status, delivery, customerId, from, to, limit, offset } = request.query ?? {}
    const page = await listSales({
      status,
      delivery,
      customerId,
      from,
      to,
      limit: limit != null ? Number(limit) : 50,
      offset: offset != null ? Number(offset) : 0,
    })
    const items = await Promise.all(page.items.map(saleResponse))
    return { ...page, items }
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function get(request, reply) {
  try {
    const sale = await findSale(request.params.id)
    if (!sale) {
      reply.status(404).send({ error: 'Venta no encontrada' })
      return
    }
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function create(request, reply) {
  try {
    const body = request.body
    const sale = await createSale({
      customerId: body.customerId,
      priceRef: body.priceRef,
      items: body.items,
      note: body.note,
      agentName: agentNameOf(request),
    })
    reply.status(201).send(await saleResponse(sale))
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function update(request, reply) {
  try {
    const body = request.body
    const sale = await updateSale(request.params.id, {
      customerId: body.customerId,
      priceRef: body.priceRef,
      items: body.items,
      note: body.note,
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function pay(request, reply) {
  try {
    const sale = await addPayment(request.params.id, {
      method: request.body.method,
      amount: request.body.amount,
      note: request.body.note,
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function void_(request, reply) {
  try {
    const sale = await voidSale(request.params.id, {
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function deliver(request, reply) {
  try {
    const sale = await deliverSale(request.params.id, {
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function undeliver(request, reply) {
  try {
    const sale = await undeliverSale(request.params.id, {
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function receivables(request, reply) {
  try {
    const sales = await listReceivables()
    const withBal = await Promise.all(sales.map(saleResponse))
    return summarizeReceivables(withBal)
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

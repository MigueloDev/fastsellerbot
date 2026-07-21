import {
  createSale,
  addPayment,
  voidSale,
  findSale,
  listSales,
  listReceivables,
  SaleError,
} from '../../db/sales.js'
import { StockError } from '../../db/stock.js'
import { balanceView } from '../../sales/balance.js'
import { matchesPriceRef } from '../../sales/paymentMethods.js'

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
    const { status, customerId, from, to, limit, offset } = request.query ?? {}
    const page = await listSales({
      status,
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

export async function receivables(request, reply) {
  try {
    const sales = await listReceivables()
    const withBal = await Promise.all(sales.map(saleResponse))

    /** @type {Map<string, { customer: object, sales: object[], totalOwedUsd: number, totalOwedBs: number|null, oldestAt: string }>} */
    const byCustomer = new Map()
    let grandUsd = 0
    let grandBs = 0
    let hasBs = false
    let bsRate = null

    for (const s of withBal) {
      const key = s.customerId
      let group = byCustomer.get(key)
      if (!group) {
        group = {
          customer: s.customer,
          sales: [],
          totalOwedUsd: 0,
          totalOwedBs: null,
          oldestAt: s.createdAt,
        }
        byCustomer.set(key, group)
      }
      group.sales.push(s)
      group.totalOwedUsd = Math.round((group.totalOwedUsd + s.balanceUsd) * 100) / 100
      if (s.balanceBs != null) {
        group.totalOwedBs =
          Math.round(((group.totalOwedBs ?? 0) + s.balanceBs) * 100) / 100
      }
      grandUsd = Math.round((grandUsd + s.balanceUsd) * 100) / 100
      if (s.balanceBs != null) {
        grandBs = Math.round((grandBs + s.balanceBs) * 100) / 100
        hasBs = true
      }
      if (s.bsRate) bsRate = s.bsRate
    }

    const customers = [...byCustomer.values()].sort(
      (a, b) => new Date(a.oldestAt).getTime() - new Date(b.oldestAt).getTime(),
    )

    return {
      totalOwedUsd: grandUsd,
      totalOwedBs: hasBs ? grandBs : null,
      bsRate,
      customers,
    }
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

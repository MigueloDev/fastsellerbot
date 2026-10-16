import {
  createSale,
  updateSale,
  addPayment,
  voidSale,
  deliverSale,
  undeliverSale,
  findSale,
  findPaymentReceipt,
  setPaymentReceiptPath,
  clearPaymentReceipt,
  listSales,
  listReceivables,
  SaleError,
} from '../../db/sales.js'
import { StockError } from '../../db/stock.js'
import { CashError } from '../../cash/movement.js'
import { balanceView } from '../../sales/balance.js'
import { matchesPriceRef } from '../../sales/paymentMethods.js'
import { summarizeReceivables } from '../../sales/receivablesSummary.js'
import { parseReceiptBase64, ReceiptError } from '../../sales/receipt.js'
import {
  deletePaymentReceipt,
  signedReceiptUrl,
  uploadPaymentReceipt,
} from '../../storage/receipts.js'
import { ownsSale, redactSaleForSeller } from '../roles.js'

function isSeller(request) {
  return request.user?.role === 'VENDEDOR'
}

async function present(request, sale) {
  const body = await saleResponse(sale)
  return isSeller(request) ? redactSaleForSeller(body) : body
}

/** @returns {Promise<boolean>} false si ya respondió 404/403 */
async function sellerOwns(request, reply, saleId) {
  if (!isSeller(request)) return true
  const sale = await findSale(saleId)
  if (!sale) {
    reply.status(404).send({ error: 'Venta no encontrada' })
    return false
  }
  if (!ownsSale(sale, request.user?.staffId)) {
    reply.status(403).send({ error: 'No autorizado' })
    return false
  }
  return true
}

function agentNameOf(request) {
  return request.user?.name ?? 'Agente'
}

function handleError(err, reply) {
  if (
    err instanceof SaleError ||
    err instanceof StockError ||
    err instanceof ReceiptError ||
    err instanceof CashError
  ) {
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
    // Clamp: evita page sizes ilimitados (resource-exhaustion).
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const safeOffset = Math.max(Number(offset) || 0, 0)
    const page = await listSales({
      status,
      delivery,
      customerId,
      sellerId: isSeller(request) ? request.user.staffId : undefined,
      from,
      to,
      limit: safeLimit,
      offset: safeOffset,
    })
    const items = await Promise.all(page.items.map((sale) => present(request, sale)))
    return { ...page, items }
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function get(request, reply) {
  try {
    const sale = await findSale(request.params.id)
    if (!sale) {
      reply.status(404).send({ error: 'Venta no encontrada' })
      return
    }
    if (isSeller(request) && !ownsSale(sale, request.user?.staffId)) {
      reply.status(403).send({ error: 'No autorizado' })
      return
    }
    return await present(request, sale)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
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
      sellerId: request.user?.staffId ?? null,
    })
    reply.status(201).send(await present(request, sale))
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
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
    throw err
  }
}

export async function pay(request, reply) {
  let uploadedPath = null
  try {
    if (!(await sellerOwns(request, reply, request.params.id))) return
    const parsed = parseReceiptBase64(request.body.receiptBase64)
    if (parsed) {
      uploadedPath = await uploadPaymentReceipt(
        request.params.id,
        parsed.buffer,
        parsed.contentType,
      )
    }
    const sale = await addPayment(request.params.id, {
      method: request.body.method,
      amount: request.body.amount,
      note: request.body.note,
      agentName: agentNameOf(request),
      receiptPath: uploadedPath,
      rateId: request.body.rateId || null,
      accountId: request.body.accountId,
    })
    return await present(request, sale)
  } catch (err) {
    if (uploadedPath) await deletePaymentReceipt(uploadedPath)
    if (handleError(err, reply)) return
    throw err
  }
}

export async function receiptUrl(request, reply) {
  try {
    const payment = await findPaymentReceipt(request.params.id)
    if (!payment) {
      reply.status(404).send({ error: 'Pago no encontrado' })
      return
    }
    if (!(await sellerOwns(request, reply, payment.saleId))) return
    if (!payment.receiptPath) {
      reply.status(404).send({ error: 'Este pago no tiene comprobante' })
      return
    }
    const url = await signedReceiptUrl(payment.receiptPath)
    return { url, expiresIn: 60 }
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function putReceipt(request, reply) {
  let uploadedPath = null
  let committed = false
  try {
    const parsed = parseReceiptBase64(request.body.receiptBase64)
    if (!parsed) {
      reply.status(422).send({ error: 'receiptBase64 es requerido' })
      return
    }
    const payment = await findPaymentReceipt(request.params.id)
    if (!payment) {
      reply.status(404).send({ error: 'Pago no encontrado' })
      return
    }
    uploadedPath = await uploadPaymentReceipt(
      payment.saleId,
      parsed.buffer,
      parsed.contentType,
    )
    const { saleId, previousPath } = await setPaymentReceiptPath(
      request.params.id,
      uploadedPath,
    )
    committed = true
    if (previousPath) await deletePaymentReceipt(previousPath)
    const sale = await findSale(saleId)
    return await saleResponse(sale)
  } catch (err) {
    if (uploadedPath && !committed) await deletePaymentReceipt(uploadedPath)
    if (handleError(err, reply)) return
    throw err
  }
}

export async function deleteReceipt(request, reply) {
  try {
    const { saleId, previousPath } = await clearPaymentReceipt(request.params.id)
    await deletePaymentReceipt(previousPath)
    const sale = await findSale(saleId)
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
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
    throw err
  }
}

export async function deliver(request, reply) {
  try {
    if (!(await sellerOwns(request, reply, request.params.id))) return
    const sale = await deliverSale(request.params.id, {
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
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
    throw err
  }
}

export async function receivables(request, reply) {
  try {
    const sales = await listReceivables()
    const withBal = await Promise.all(sales.map(saleResponse))
    return summarizeReceivables(withBal)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

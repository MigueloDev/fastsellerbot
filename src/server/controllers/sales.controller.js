import {
  createSale,
  updateSale,
  updateSaleDelivery,
  addSaleCharge,
  deleteSaleCharge,
  addPayment,
  voidSale,
  deliverSale,
  undeliverSale,
  findSale,
  findSaleByClientId,
  findPaymentByClientId,
  findPaymentReceipt,
  setPaymentReceiptPath,
  clearPaymentReceipt,
  findSaleEvidence,
  setSaleEvidencePath,
  listSales,
  listReceivables,
  SaleError,
} from '../../db/sales.js'
import { StockError } from '../../db/stock.js'
import { CashError } from '../../cash/movement.js'
import { findOrCreate } from '../../db/idempotency.js'
import { balanceView } from '../../sales/balance.js'
import { matchesPriceRef } from '../../sales/paymentMethods.js'
import { summarizeReceivables } from '../../sales/receivablesSummary.js'
import { parseFileBase64, parseReceiptBase64, ReceiptError } from '../../sales/receipt.js'
import {
  deletePaymentReceipt,
  signedReceiptUrl,
  uploadPaymentReceipt,
  uploadSaleEvidence,
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
    reply.status(err.status).send({ error: err.message, ...err.extra })
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
    const { status, delivery, deliveryType, customerId, from, to, limit, offset } = request.query ?? {}
    // Clamp: evita page sizes ilimitados (resource-exhaustion).
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const safeOffset = Math.max(Number(offset) || 0, 0)
    const page = await listSales({
      status,
      delivery,
      deliveryType,
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
    const { record: sale, replayed } = await findOrCreate(body.clientId, {
      find: findSaleByClientId,
      create: () =>
        createSale({
          clientId: body.clientId,
          customerId: body.customerId,
          priceRef: body.priceRef,
          items: body.items,
          note: body.note,
          delivery: body.delivery,
          charges: body.charges,
          agentName: agentNameOf(request),
          sellerId: request.user?.staffId ?? null,
        }),
    })
    if (replayed) {
      if (isSeller(request) && !ownsSale(sale, request.user?.staffId)) {
        reply.status(409).send({ error: 'clientId ya usado en otra venta' })
        return
      }
      reply.header('Idempotent-Replay', 'true')
      reply.status(200).send(await present(request, sale))
      return
    }
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
      delivery: body.delivery,
      charges: body.charges,
      agentName: agentNameOf(request),
    })
    return await saleResponse(sale)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function setDelivery(request, reply) {
  try {
    if (!(await sellerOwns(request, reply, request.params.id))) return
    const sale = await updateSaleDelivery(request.params.id, request.body)
    return await present(request, sale)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function addCharge(request, reply) {
  try {
    const sale = await addSaleCharge(request.params.id, {
      ...request.body,
      agentName: agentNameOf(request),
    })
    reply.status(201).send(await saleResponse(sale))
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function removeCharge(request, reply) {
  try {
    const sale = await deleteSaleCharge(request.params.id, request.params.chargeId)
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
    const saleId = request.params.id
    const body = request.body
    const parsed = parseReceiptBase64(body.receiptBase64, body.receiptContentType || 'image/webp')

    const { record, replayed } = await findOrCreate(body.clientId, {
      find: findPaymentByClientId,
      create: async () => {
        if (parsed) {
          uploadedPath = await uploadPaymentReceipt(
            saleId,
            parsed.buffer,
            parsed.contentType,
            parsed.ext,
          )
        }
        return addPayment(saleId, {
          clientId: body.clientId,
          method: body.method,
          amount: body.amount,
          note: body.note,
          agentName: agentNameOf(request),
          receiptPath: uploadedPath,
          rateId: body.rateId || null,
          accountId: body.accountId,
          paidAt: body.paidAt || null,
        })
      },
    })

    if (replayed) {
      if (uploadedPath) await deletePaymentReceipt(uploadedPath)
      if (record.saleId !== saleId) {
        reply.status(409).send({ error: 'clientId ya usado en otro pago' })
        return
      }
      const sale = await findSale(saleId)
      reply.header('Idempotent-Replay', 'true')
      reply.status(200).send(await present(request, sale))
      return
    }

    return await present(request, record)
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

export async function uploadEvidence(request, reply) {
  let uploadedPath = null
  let committed = false
  try {
    if (!(await sellerOwns(request, reply, request.params.id))) return
    const parsed = parseFileBase64(request.body.fileBase64, request.body.contentType)
    if (!parsed) {
      reply.status(422).send({ error: 'fileBase64 es requerido' })
      return
    }
    const saleId = request.params.id
    uploadedPath = await uploadSaleEvidence(saleId, parsed.buffer, parsed.contentType, parsed.ext)
    const { previousPath } = await setSaleEvidencePath(saleId, uploadedPath)
    committed = true
    if (previousPath) await deletePaymentReceipt(previousPath)
    const sale = await findSale(saleId)
    return await present(request, sale)
  } catch (err) {
    if (uploadedPath && !committed) await deletePaymentReceipt(uploadedPath)
    if (handleError(err, reply)) return
    throw err
  }
}

export async function evidenceUrl(request, reply) {
  try {
    if (!(await sellerOwns(request, reply, request.params.id))) return
    const evidence = await findSaleEvidence(request.params.id)
    if (!evidence) {
      reply.status(404).send({ error: 'Venta no encontrada' })
      return
    }
    if (!evidence.evidencePath) {
      reply.status(404).send({ error: 'Esta venta no tiene evidencia' })
      return
    }
    const url = await signedReceiptUrl(evidence.evidencePath)
    return { url, expiresIn: 60 }
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

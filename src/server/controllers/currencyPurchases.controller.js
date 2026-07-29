import { randomBytes } from 'node:crypto'
import {
  listCurrencyPurchases,
  listEligibleSales,
  createCurrencyPurchase,
  findCurrencyPurchaseReceipt,
  CurrencyPurchaseError,
} from '../../db/currencyPurchases.js'
import { parseReceiptBase64, ReceiptError } from '../../sales/receipt.js'
import {
  deletePaymentReceipt,
  signedReceiptUrl,
  uploadCurrencyPurchaseReceipt,
} from '../../storage/receipts.js'

function agentNameOf(request) {
  return request.user?.name ?? 'Agente'
}

function handleError(err, reply) {
  if (
    err instanceof CurrencyPurchaseError ||
    err instanceof ReceiptError
  ) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

/** @param {Record<string, unknown>} body */
function resolveSaleIds(body) {
  if (Array.isArray(body.saleIds) && body.saleIds.length) {
    return body.saleIds.map((s) => String(s))
  }
  if (typeof body.saleId === 'string' && body.saleId.trim()) {
    return [body.saleId.trim()]
  }
  return []
}

function newPurchaseId() {
  // ponytail: hex id; Prisma cuid default ok for rows without pre-upload
  return randomBytes(16).toString('hex')
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
    throw err
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
    throw err
  }
}

export async function create(request, reply) {
  let uploadedPath = null
  try {
    const body = request.body ?? {}
    const saleIds = resolveSaleIds(body)
    if (!saleIds.length) {
      reply.status(422).send({ error: 'saleIds es requerido' })
      return
    }

    const purchaseId = newPurchaseId()
    const parsed = parseReceiptBase64(body.receiptBase64)
    if (parsed) {
      uploadedPath = await uploadCurrencyPurchaseReceipt(
        purchaseId,
        parsed.buffer,
        parsed.contentType,
      )
    }
    const purchase = await createCurrencyPurchase({
      id: purchaseId,
      saleIds,
      binanceRate: body.binanceRate,
      usdtReceived: body.usdtReceived,
      note: body.note,
      agentName: agentNameOf(request),
      receiptPath: uploadedPath,
    })
    reply.status(201).send(purchase)
  } catch (err) {
    if (uploadedPath) await deletePaymentReceipt(uploadedPath)
    if (handleError(err, reply)) return
    throw err
  }
}

export async function receiptUrl(request, reply) {
  try {
    const purchase = await findCurrencyPurchaseReceipt(request.params.id)
    if (!purchase) {
      reply.status(404).send({ error: 'Compra de divisas no encontrada' })
      return
    }
    if (!purchase.receiptPath) {
      reply.status(404).send({ error: 'Esta compra no tiene comprobante' })
      return
    }
    const url = await signedReceiptUrl(purchase.receiptPath)
    return { url, expiresIn: 60 }
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

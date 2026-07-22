import {
  getSalesReport,
  getKardex,
  getProductMovements,
  ReportError,
} from '../../db/reports.js'
import { parseRange } from '../queryRange.js'

function handleError(err, reply) {
  if (err instanceof ReportError) {
    reply.status(err.status).send({ error: err.message })
    return true
  }
  return false
}

export async function sales(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(400).send({ error: range.error })
      return
    }
    const { status, delivery, customerId } = request.query ?? {}
    return await getSalesReport({ ...range, status, delivery, customerId })
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function kardex(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(400).send({ error: range.error })
      return
    }
    const { productId, variantId } = request.query ?? {}
    return await getKardex({
      ...range,
      productId,
      variantId: variantId === '' || variantId === 'null' ? null : variantId,
    })
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

export async function movements(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(400).send({ error: range.error })
      return
    }
    const { productId } = request.query ?? {}
    return await getProductMovements({ ...range, productId })
  } catch (err) {
    if (handleError(err, reply)) return
    reply.status(500).send({ error: err.message })
  }
}

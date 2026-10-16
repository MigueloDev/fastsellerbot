import {
  getSalesReport,
  getKardex,
  getProductMovements,
  getFxReport,
  ReportError,
} from '../../db/reports.js'
import { parseRange } from '../queryRange.js'
import {
  buildFxDetailCsv,
  buildFxSummaryCsv,
  fxCsvFilename,
} from '../fxCsv.js'

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
    const { status, delivery, customerId, paymentState } = request.query ?? {}
    return await getSalesReport({
      ...range,
      status,
      delivery,
      customerId,
      paymentState,
    })
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
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
    throw err
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
    throw err
  }
}

export async function fx(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(400).send({ error: range.error })
      return
    }
    return await getFxReport(range)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

export async function fxCsv(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(400).send({ error: range.error })
      return
    }
    const mode = request.query?.mode === 'summary' ? 'summary' : 'detail'
    const report = await getFxReport(range)
    const csv =
      mode === 'summary' ? buildFxSummaryCsv(report) : buildFxDetailCsv(report)
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${fxCsvFilename(range, mode)}"`,
      )
      .send(`\ufeff${csv}`)
  } catch (err) {
    if (handleError(err, reply)) return
    throw err
  }
}

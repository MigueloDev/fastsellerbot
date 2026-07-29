import { getMetricsSummary } from '../../db/metrics.js'
import { parseRange } from '../queryRange.js'

export async function summary(request, reply) {
  try {
    const range = parseRange(request.query)
    if ('error' in range) {
      reply.status(400).send({ error: range.error })
      return
    }
    return await getMetricsSummary(range)
  } catch (err) {
    throw err
  }
}

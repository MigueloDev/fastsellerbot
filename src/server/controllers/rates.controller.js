import { getRates } from '../../rates/getRates.js'
import { listRates } from '../../db/rates.js'

export async function get(request, reply) {
  try {
    return await getRates()
  } catch (err) {
    throw err
  }
}

export async function history(request, reply) {
  const source = request.query?.source || 'BCV'
  if (!['BCV', 'BINANCE'].includes(source)) {
    return reply.status(422).send({ error: 'source inválido' })
  }
  const limit = Number(request.query?.limit) || 24
  return { items: await listRates(source, { limit }) }
}

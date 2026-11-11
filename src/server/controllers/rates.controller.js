import { getRates } from '../../rates/getRates.js'
import { listRates } from '../../db/rates.js'
import { processRateFetch, storeManualRate } from '../../rates/process.js'

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

/** POST /rates { source, rate? } — con rate guarda manual; sin rate fuerza fetch upstream. */
export async function update(request, reply) {
  const { source, rate } = request.body
  let result
  try {
    result = rate == null
      ? await processRateFetch(source, { force: true })
      : await storeManualRate(source, rate)
  } catch (err) {
    return reply.status(502).send({ error: `No se pudo consultar ${source}: ${err.message}` })
  }
  if (!result.stored && result.reason !== 'unchanged') {
    return reply.status(422).send({ error: `Tasa rechazada: ${result.reason}` })
  }
  return { stored: result.stored, ...(await getRates()) }
}

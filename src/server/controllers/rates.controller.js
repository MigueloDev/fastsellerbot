import { getRates } from '../../rates/getRates.js'

export async function get(request, reply) {
  try {
    return await getRates()
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

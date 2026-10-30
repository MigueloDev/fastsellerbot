// BullMQ desactivado (Upstash free cobra por comando): cola en memoria abajo.
// import { Queue } from 'bullmq'
// import { redisConnection } from './client.js'
//
// const outboundQueue = new Queue('outbound-messages', {
//   connection: redisConnection,
//   defaultJobOptions: {
//     attempts: 3,
//     backoff: { type: 'exponential', delay: 2000 },
//     removeOnComplete: 100,
//     removeOnFail: 50,
//   },
// })
//
// export async function enqueueMessage(jid, text, type = 'bot', key) {
//   try {
//     const job = await outboundQueue.add('send-message', { jid, text, type, key })
//     console.log('📬 Encolado:', { jid, type, chars: text.length })
//     return job
//   } catch (err) {
//     console.error('❌ Error al encolar:', err.message)
//   }
// }
//
// export { outboundQueue }

import { retry } from '../lib/retry.js'
import { deliver } from './worker.js'

// ponytail: cola en memoria (concurrency 1); pendientes se pierden al reiniciar. Volver a BullMQ/pg-boss si importa.
let tail = Promise.resolve()

export async function enqueueMessage(jid, text, type = 'bot', key) {
  const job = { jid, text, type, key }
  tail = tail
    .then(() => retry(() => deliver(job)))
    .catch(err => console.error('❌ Envío fallido:', { jid, type }, err.message))
  console.log('📬 Encolado:', { jid, type, chars: text.length })
  return job
}

import { Queue } from 'bullmq'
import { redisConnection } from './client.js'

const outboundQueue = new Queue('outbound-messages', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

export async function enqueueMessage(jid, text, type = 'bot') {
  try {
    const job = await outboundQueue.add('send-message', { jid, text, type })
    console.log('📬 Encolado:', { jid, type, chars: text.length })
    return job
  } catch (err) {
    console.error('❌ Error al encolar:', err.message)
  }
}

export { outboundQueue }

import { Worker } from 'bullmq'
import { redisConnection } from './client.js'
import { readDelay, typingDelay } from './humanizer.js'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createWorker(sock) {
  const worker = new Worker(
    'outbound-messages',
    async (job) => {
      const { jid, text, type } = job.data

      console.log('⚙️  Procesando job:', { jid, type, jobId: job.id })

      // 1. Simular que leyó el mensaje
      await sleep(readDelay())

      // 2. Mostrar indicador de escritura
      await sock.sendPresenceUpdate('composing', jid)
      console.log('✍️  Typing...', jid)

      // 3. Esperar según largo del texto
      await sleep(typingDelay(text))

      // 4. Enviar mensaje
      await sock.sendMessage(jid, { text })
      console.log('✅ Enviado:', { jid, type, chars: text.length })

      // 5. Quitar indicador de escritura
      await sock.sendPresenceUpdate('paused', jid)
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  )

  worker.on('completed', (job) => console.log('✅ Job completado:', job.id))
  worker.on('failed', (job, err) => console.error('❌ Job fallido:', job?.id, err.message))
  worker.on('error', (err) => console.error('❌ Worker error:', err.message))

  return worker
}

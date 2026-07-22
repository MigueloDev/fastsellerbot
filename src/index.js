import 'dotenv/config'
import { createConnection, registerEvents } from './baileys/index.js'
import { createWorker } from './queue/worker.js'
import { createRatesWorker } from './queue/ratesWorker.js'
import { setupRatesJobs } from './queue/ratesProducer.js'
import { runMigrations } from './db/migrations.js'
import { createAppServer } from './server/fastify.js'

// Rates worker is independent of Baileys reconnect (outbound worker is recreated).
createRatesWorker()
await setupRatesJobs()
/* console.log('💱 Rates worker + schedulers iniciados') */

async function start(existingWorker = null) {
  await runMigrations()
  const { sock, redis } = await createConnection()
  registerEvents(sock, redis, process.env.SESSION_ID)
  if (existingWorker) await existingWorker.close()
  const worker = createWorker(sock)
  /* console.log('⚙️  Worker de cola iniciado') */
  await createAppServer(sock)
  /* console.log('🚀 Bot iniciado, esperando conexión...') */
  return worker
}

process.on('unhandledRejection', (err) => console.error('❌ Error no manejado:', err))
let currentWorker = await start().catch(err => { console.error('❌ Error fatal:', err); process.exit(1) })

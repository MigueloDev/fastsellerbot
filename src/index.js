import 'dotenv/config'
// Bot de WhatsApp apagado para este despliegue (sin funcionalidad de bot).
// import { createConnection, registerEvents, setCurrentSock } from './baileys/index.js'
// import { createWorker } from './queue/worker.js'
// BullMQ desactivado (Upstash free): ver src/rates/schedule.js
// import { createRatesWorker } from './queue/ratesWorker.js'
// import { setupRatesJobs } from './queue/ratesProducer.js'
import { startRatesSchedule } from './rates/schedule.js'
import { runMigrations } from './db/migrations.js'
import { createAppServer } from './server/fastify.js'

// Rates worker is independent of Baileys reconnect (outbound worker is recreated).
// createRatesWorker()
// await setupRatesJobs()
startRatesSchedule()
/* console.log('💱 Rates worker + schedulers iniciados') */

async function start() {
  await runMigrations()
  // Bot de WhatsApp apagado: server HTTP arranca sin socket de Baileys.
  await createAppServer(null)
}

process.on('unhandledRejection', (err) => console.error('❌ Error no manejado:', err))
await start().catch(err => { console.error('❌ Error fatal:', err); process.exit(1) })

import 'dotenv/config'
import { createConnection, registerEvents } from './baileys/index.js'

async function start() {
  const { sock, redis } = await createConnection()
  registerEvents(sock, redis, process.env.SESSION_ID)
  console.log('🚀 Bot iniciado, esperando conexión...')
}

process.on('unhandledRejection', (err) => console.error('❌ Error no manejado:', err))
start().catch(err => { console.error('❌ Error fatal:', err); process.exit(1) })

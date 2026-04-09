import { DisconnectReason } from '@whiskeysockets/baileys'
import { deleteKeysWithPattern } from 'baileys-redis-auth'
import qrcode from 'qrcode-terminal'
import { createConnection } from './connection.js'
import { processMessage } from '../pipeline/index.js'
import { createWorker } from '../queue/worker.js'

export function registerEvents(sock, redis, sessionId) {
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('✅ Bot conectado a WhatsApp')
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode

      console.log('🔄 Conexión cerrada, código:', lastDisconnect?.error?.output?.statusCode)

      if (statusCode === DisconnectReason.loggedOut) {
        await deleteKeysWithPattern({ redis, sessionId, logger: console.log })
        console.log('🔴 Sesión cerrada — vuelve a escanear el QR')
      } else {
        console.log('🔄 Conexión cerrada, reconectando en 5s... código:', statusCode)
        setTimeout(async () => {
          const result = await createConnection()
          registerEvents(result.sock, result.redis, sessionId)
          createWorker(result.sock)
        }, 5000)
      }
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue
      if (!msg.message) continue

      try {
        processMessage(sock, msg)
      } catch (err) {
        console.error('❌ Error en pipeline:', err)
      }
    }
  })
}

import Fastify from 'fastify'
import { Server } from 'socket.io'
import { registerAuthHook } from './hooks.js'
import { verifyClerkToken } from './auth.js'
import { EVENTS } from './events.js'
import { getWhatsAppState } from '../baileys/status.js'

let io = null

export function getIO() {
  return io
}

export async function createAppServer(sockBaileys) {
  const isProd = process.env.NODE_ENV === 'production'

  // bodyLimit ~8 MB: los comprobantes llegan como JSON base64 (imagen hasta 5 MiB
  // → ~6.7 MB en base64). El default de Fastify (1 MB) rechazaría el upload.
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 })

  // CORS: en producción solo el dashboard real. localhost solo fuera de prod.
  const origins = isProd
    ? [process.env.DASHBOARD_URL].filter(Boolean)
    : [process.env.DASHBOARD_URL ?? 'http://localhost:3004', 'http://localhost:3600']

  if (origins.length === 0) {
    throw new Error('DASHBOARD_URL es obligatorio en producción (CORS)')
  }

  // Security headers (helmet). CSP mínima: es una API JSON, no sirve HTML.
  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  })

  // Rate limiting global. Los límites finos por ruta se aplican en los plugins.
  await app.register(import('@fastify/rate-limit'), {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  })

  await app.register(import('@fastify/cors'), {
    origin: origins,
    credentials: true,
  })

  // Error handler global: no filtrar mensajes internos (Prisma/pg) al cliente.
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode ?? 500
    if (status >= 500) {
      console.error('❌ Error no controlado:', error)
      reply.status(500).send({ error: 'Error interno del servidor' })
      return
    }
    // Errores 4xx (incl. validación/rate-limit) sí pueden devolver su mensaje.
    reply.status(status).send({ error: error.message })
  })

  registerAuthHook(app)

  const { registerRoutes } = await import('./routes/index.js')
  await registerRoutes(app, sockBaileys)

  const PORT = Number(process.env.SERVER_PORT ?? 3600)

  // Iniciar Fastify primero
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`🚀 Servidor HTTP corriendo en puerto ${PORT}`)

  // Adjuntar Socket.IO al servidor de Fastify ya iniciado
  io = new Server(app.server, {
    cors: {
      origin: origins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  })

  // Proteger Socket.IO — verificar token en el handshake (Clerk invite-only)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token
    const user = await verifyClerkToken(token)
    if (!user) {
      next(new Error('No autorizado'))
      return
    }
    socket.user = user
    next()
  })

  io.on('connection', (socket) => {
    console.log('📊 Dashboard conectado:', socket.id)

    // Estado/QR actual para dashboards recién conectados
    socket.emit(EVENTS.BOT_STATUS, getWhatsAppState())

    socket.on('join_conversation', (jid) => {
      socket.join(jid)
      console.log('📊 Join conversation:', jid)
    })

    socket.on('leave_conversation', (jid) => {
      socket.leave(jid)
    })

    socket.on('disconnect', () => {
      console.log('📊 Dashboard desconectado:', socket.id)
    })
  })

  console.log(`🔌 Socket.IO listo`)

  return { app, io }
}
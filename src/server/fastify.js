import Fastify from 'fastify'
import { Server } from 'socket.io'

let io = null

export function getIO() {
  return io
}

export async function createAppServer(sockBaileys) {
  const app = Fastify({ logger: false })

  const origins = [
    process.env.DASHBOARD_URL ?? 'http://localhost:3600',
    'http://localhost:3600',
  ]

  await app.register(import('@fastify/cors'), {
    origin: origins,
    credentials: true,
  })

  const { registerRoutes } = await import('./routes.js')
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

  io.on('connection', (socket) => {
    console.log('📊 Dashboard conectado:', socket.id)

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
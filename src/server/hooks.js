import { verifyClerkToken, extractToken } from './auth.js'

export function registerAuthHook(app) {
  app.addHook('preHandler', async (request, reply) => {
    // Excluir health check — necesario para el tunnel
    if (request.url === '/health') return

    const token = extractToken(request)
    const user = await verifyClerkToken(token)

    if (!user) {
      reply.status(401).send({ error: 'No autorizado' })
      return
    }

    // Adjuntar usuario al request para usarlo en las rutas
    request.user = user
  })
}

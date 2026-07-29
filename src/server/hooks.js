import { verifyClerkToken, extractToken } from './auth.js'

export function registerAuthHook(app) {
  app.addHook('preHandler', async (request, reply) => {
    // Excluir health check — necesario para el tunnel/uptime monitor.
    // Comparar solo el pathname: /health?x=1 no debe saltarse el auth.
    const pathname = request.url.split('?')[0]
    if (pathname === '/health') return

    const token = extractToken(request)
    const user = await verifyClerkToken(token)

    // Clerk es invite-only: un token válido = usuario aprobado.
    if (!user) {
      reply.status(401).send({ error: 'No autorizado' })
      return
    }

    // Adjuntar usuario al request para usarlo en las rutas
    request.user = user
  })
}

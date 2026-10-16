import { verifyClerkToken, extractToken } from './auth.js'
import { resolveStaff } from '../db/staff.js'
import { sellerCanAccess } from './roles.js'

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

    const staff = await resolveStaff({
      clerkUserId: user.userId,
      email: user.email,
      name: user.name,
    })
    request.user = {
      ...user,
      staffId: staff.id,
      role: staff.role,
    }

    if (staff.role !== 'ADMIN' && !sellerCanAccess(request.method, pathname)) {
      reply.status(403).send({ error: 'No autorizado' })
      return
    }
  })
}

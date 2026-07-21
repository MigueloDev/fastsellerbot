import { verifyToken } from '@clerk/backend'

const secretKey = process.env.CLERK_SECRET_KEY

/**
 * Verifica el JWT de sesión de Clerk con verifyToken de @clerk/backend.
 * createClerkClient no expone verifyToken (solo API REST + authenticateRequest).
 * Opcional: pasar authorizedParties en options si quieres validar el claim azp.
 * El JWT de sesión suele incluir sub; email/nombre pueden faltar sin plantilla JWT.
 */
export async function verifyClerkToken(token) {
  if (!token || !secretKey) return null

  try {
    const payload = await verifyToken(token, { secretKey })

    return {
      userId: payload.sub,
      email: payload.email ?? null,
      name: payload.name
        ?? payload.first_name
        ?? payload.given_name
        ?? payload.email?.split('@')[0]
        ?? 'Agente',
    }
  } catch {
    return null
  }
}

export function extractToken(request) {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}

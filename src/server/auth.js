import { verifyToken } from '@clerk/backend'

const secretKey = process.env.CLERK_SECRET_KEY
const jwtKey = process.env.CLERK_JWT_KEY || undefined

export async function verifyClerkToken(token) {
  if (!token || !secretKey) return null
  try {
    const payload = await verifyToken(token, {
      secretKey,
      ...(jwtKey ? { jwtKey } : {}),
    })
    if (!payload?.sub) return null

    const email = typeof payload.primaryEmail === 'string' ? payload.primaryEmail : null
    const name =
      [payload.firstName, payload.lastName].filter(Boolean).join(' ') || 'Agente'

    return { userId: payload.sub, email, name }
  } catch {
    return null
  }
}

export function extractToken(request) {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}

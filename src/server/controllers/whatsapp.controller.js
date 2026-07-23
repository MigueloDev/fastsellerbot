import { getWhatsAppState, getCurrentSock } from '../../baileys/status.js'

export async function getStatus(request, reply) {
  try {
    return getWhatsAppState()
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

export async function logout(request, reply) {
  try {
    const sock = getCurrentSock()
    if (!sock) {
      reply.status(409).send({ error: 'No hay conexión activa de WhatsApp' })
      return
    }
    await sock.logout()
    return { ok: true }
  } catch (err) {
    // Si la conexión ya estaba caída, el logout igual dispara la purga de sesión.
    const { status } = getWhatsAppState()
    if (status === 'disconnected' || status === 'logged_out') {
      return { ok: true }
    }
    reply.status(500).send({ error: err.message })
  }
}

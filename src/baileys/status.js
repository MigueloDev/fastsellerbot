import { getIO } from '../server/fastify.js'
import { EVENTS } from '../server/events.js'

// Estado en memoria: proceso único, no hace falta persistirlo.
const state = {
  status: 'connecting', // 'connecting' | 'waiting_qr' | 'connected' | 'disconnected' | 'logged_out'
  qr: null,
  user: null,
  updatedAt: new Date().toISOString(),
}

let currentSock = null

export function getWhatsAppState() {
  return { ...state }
}

export function updateWhatsAppState(patch) {
  Object.assign(state, patch, { updatedAt: new Date().toISOString() })
  getIO()?.emit(EVENTS.BOT_STATUS, getWhatsAppState())
}

export function setCurrentSock(sock) {
  currentSock = sock
}

export function getCurrentSock() {
  return currentSock
}

import { createHmac, timingSafeEqual } from 'node:crypto'
import { parseInterval } from '../rates/parseInterval.js'

// ponytail: token stateless, no se puede revocar antes de expirar; si hace falta,
// guardar un linkVersion en SaleLayaway y meterlo en el payload.

const DEFAULT_TTL_MS = 7 * 86_400_000

function secretOf(secret) {
  const s = secret ?? process.env.CONTRACT_LINK_SECRET
  if (!s || s.length < 16) throw new Error('CONTRACT_LINK_SECRET no configurado (mín. 16 caracteres)')
  return s
}

function hmac(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

/**
 * Token nuevo en cada llamada (exp distinto): base64url(saleId.exp).firma
 * @param {string} saleId
 * @param {{ now?: number, ttlMs?: number, secret?: string }} [opts]
 */
export function signContractToken(saleId, { now = Date.now(), ttlMs, secret } = {}) {
  const ttl = ttlMs ?? parseInterval(process.env.CONTRACT_LINK_TTL, DEFAULT_TTL_MS)
  const exp = now + ttl
  const payload = Buffer.from(`${saleId}.${exp}`).toString('base64url')
  return { token: `${payload}.${hmac(payload, secretOf(secret))}`, expiresAt: new Date(exp).toISOString() }
}

/**
 * @param {string} token
 * @returns {string|null} saleId si la firma es válida y no expiró
 */
export function verifyContractToken(token, { now = Date.now(), secret } = {}) {
  if (typeof token !== 'string') return null
  const [payload, sig, extra] = token.split('.')
  if (!payload || !sig || extra !== undefined) return null
  const expected = Buffer.from(hmac(payload, secretOf(secret)))
  const given = Buffer.from(sig)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const [saleId, expRaw] = Buffer.from(payload, 'base64url').toString().split('.')
  const exp = Number(expRaw)
  if (!saleId || !Number.isFinite(exp) || now > exp) return null
  return saleId
}

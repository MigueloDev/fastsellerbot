import { round2 } from './balance.js'

export const DELIVERY_TYPES = ['RETIRO', 'DELIVERY', 'FORANEA']
export const CHARGE_KINDS = ['DELIVERY', 'ENVIO', 'COMISION', 'OTRO']

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v) || 0
}

/**
 * billedUsd suma al total que debe el cliente; expensesUsd solo resta ganancia.
 * @param {Array<{ amountUsd: *, billedToCustomer?: boolean }>} charges
 */
export function chargesTotals(charges = []) {
  let billedUsd = 0
  let expensesUsd = 0
  for (const c of charges) {
    if (c.billedToCustomer) billedUsd += toNum(c.amountUsd)
    else expensesUsd += toNum(c.amountUsd)
  }
  return { billedUsd: round2(billedUsd), expensesUsd: round2(expensesUsd) }
}

/**
 * Normaliza un cargo de entrada; devuelve string de error o el cargo limpio.
 * @param {*} raw
 * @returns {{ error: string } | { charge: { kind: string, description: string|null, amountUsd: number, billedToCustomer: boolean } }}
 */
export function normalizeCharge(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'cargo inválido' }
  if (!CHARGE_KINDS.includes(raw.kind)) return { error: `kind debe ser uno de ${CHARGE_KINDS.join(', ')}` }
  const amountUsd = Number(raw.amountUsd)
  if (!Number.isFinite(amountUsd) || !(amountUsd > 0)) return { error: 'amountUsd debe ser > 0' }
  const description = typeof raw.description === 'string' ? raw.description.trim() || null : null
  return {
    charge: {
      kind: raw.kind,
      description,
      amountUsd: round2(amountUsd),
      billedToCustomer: raw.billedToCustomer === true,
    },
  }
}

/**
 * Extrae lat/lng de "lat,lng" o de un link de Google Maps (@lat,lng · q= · query= · ll= · !3d…!4d…).
 * Links cortos (maps.app.goo.gl) no traen coordenadas → null.
 * @param {string} text
 * @returns {{ lat: number, lng: number } | null}
 */
export function parseLatLng(text) {
  if (typeof text !== 'string') return null
  let s = text.trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    // '%' suelto: usar tal cual
  }
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},\\s*${num}`),
    new RegExp(`[?&](?:q|query|ll|destination)=(?:loc:)?${num},\\s*${num}`),
    new RegExp(`^${num},\\s*${num}$`),
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (!m) continue
    const lat = Number(m[1])
    const lng = Number(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
  }
  return null
}

/**
 * Normaliza la entrega de una venta. RETIRO limpia la dirección.
 * @param {*} raw
 * @returns {{ error: string } | { delivery: { deliveryType: string, deliveryAddress: string|null, deliveryReference: string|null, deliveryLat: number|null, deliveryLng: number|null } }}
 */
export function normalizeDelivery(raw) {
  const type = raw?.type ?? 'RETIRO'
  if (!DELIVERY_TYPES.includes(type)) return { error: `delivery.type debe ser uno de ${DELIVERY_TYPES.join(', ')}` }
  if (type === 'RETIRO') {
    return {
      delivery: { deliveryType: type, deliveryAddress: null, deliveryReference: null, deliveryLat: null, deliveryLng: null },
    }
  }
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const hasLat = raw.lat != null && raw.lat !== ''
  const hasLng = raw.lng != null && raw.lng !== ''
  if (hasLat !== hasLng) return { error: 'lat y lng van juntos' }
  let lat = null
  let lng = null
  if (hasLat) {
    lat = Number(raw.lat)
    lng = Number(raw.lng)
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return { error: 'lat/lng fuera de rango' }
  }
  const address = str(raw.address)
  if (!address && lat == null) return { error: 'delivery requiere dirección o ubicación' }
  return {
    delivery: {
      deliveryType: type,
      deliveryAddress: address,
      deliveryReference: str(raw.reference),
      deliveryLat: lat,
      deliveryLng: lng,
    },
  }
}

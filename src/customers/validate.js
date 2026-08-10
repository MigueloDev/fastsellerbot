/** Prefijos móviles VE (local 0XXX). */
export const VE_PHONE_PREFIXES = [
  '0414',
  '0424',
  '0412',
  '0422',
  '0416',
  '0426',
]

const PHONE_RE = /^(0414|0424|0412|0422|0416|0426)\d{7}$/

/**
 * Normaliza cédula VE: quita espacios/guiones, upper.
 * Acepta V|E + 6–9 dígitos, o solo 6–9 dígitos.
 * @param {string} raw
 * @returns {string|null} normalizada o null si inválida
 */
export function normalizeCedula(raw) {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase().replace(/[\s\-.]/g, '')
  if (!s) return null
  if (/^[VEJ]\d{6,9}$/.test(s)) return s
  if (/^\d{6,9}$/.test(s)) return s
  return null
}

/**
 * @param {string|null|undefined} raw
 * @returns {string|null} teléfono 11 dígitos o null si vacío; throw-style via return shape
 */
export function normalizePhone(raw) {
  if (raw == null) return { ok: true, value: null }
  const s = String(raw).trim().replace(/[\s\-]/g, '')
  if (!s) return { ok: true, value: null }
  if (!PHONE_RE.test(s)) {
    return {
      ok: false,
      error:
        'Teléfono inválido. Use prefijo 0414/0424/0412/0422/0416/0426 + 7 dígitos',
    }
  }
  return { ok: true, value: s }
}

/**
 * @param {string} firstName
 * @param {string} lastName
 */
export function displayName(firstName, lastName) {
  return `${firstName} ${lastName}`.trim()
}

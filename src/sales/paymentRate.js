const FUTURE_TOLERANCE_MS = 5 * 60 * 1000 // tolerancia de reloj offline

export function maxOfflinePaymentDays() {
  const v = Number(process.env.MAX_OFFLINE_PAYMENT_DAYS ?? 7)
  return Number.isFinite(v) && v > 0 ? v : 7
}

/**
 * Valida `paidAt` de un pago offline: tolera reloj adelantado (5 min) y topa
 * la antigüedad a `maxDays` (por defecto `MAX_OFFLINE_PAYMENT_DAYS`).
 * Sin `raw` → usa `now` (comportamiento original, pago en vivo).
 *
 * @param {string|null|undefined} raw ISO date
 * @param {{ now?: Date, maxDays?: number }} [opts]
 * @returns {{ paidAt: Date } | { error: { status: number, message: string } }}
 */
export function parsePaidAt(raw, { now = new Date(), maxDays = maxOfflinePaymentDays() } = {}) {
  if (raw == null || raw === '') return { paidAt: now }

  const paidAt = new Date(raw)
  if (Number.isNaN(paidAt.getTime())) {
    return { error: { status: 422, message: 'paidAt inválido' } }
  }

  if (paidAt.getTime() - now.getTime() > FUTURE_TOLERANCE_MS) {
    return { error: { status: 422, message: 'paidAt no puede estar en el futuro' } }
  }

  const oldestAllowed = now.getTime() - maxDays * 24 * 60 * 60 * 1000
  if (paidAt.getTime() < oldestAllowed) {
    return {
      error: {
        status: 422,
        message: `paidAt supera los ${maxDays} días permitidos para pagos offline`,
      },
    }
  }

  return { paidAt }
}

/**
 * Elige la tasa BCV vigente al momento `paidAt`: la de `fetchedAt` más
 * reciente que no sea posterior a `paidAt`.
 *
 * @param {Array<{ rate: number, fetchedAt: string|Date }>} rates
 * @param {Date} paidAt
 * @returns {{ quote: { rate: number, fetchedAt: string|Date } } | { error: { status: number, message: string } }}
 */
export function resolveRateAt(rates, paidAt) {
  const paidAtMs = paidAt.getTime()
  let best = null
  for (const r of rates ?? []) {
    const fetchedMs = new Date(r.fetchedAt).getTime()
    if (fetchedMs <= paidAtMs && (!best || fetchedMs > new Date(best.fetchedAt).getTime())) {
      best = r
    }
  }
  if (!best) {
    return {
      error: {
        status: 422,
        message: 'No hay tasa BCV registrada antes de paidAt',
      },
    }
  }
  return { quote: best }
}

/**
 * Cotización BCV para un pago:
 * - rateId → tasa histórica elegida en el dashboard (p. ej. pago de ayer cargado hoy)
 * - sin rateId, con paidAt → última tasa BCV con fetchedAt <= paidAt (pago offline)
 * - sin rateId ni paidAt → live de readRate (comportamiento original)
 *
 * @param {string|null|undefined} rateId
 * @param {{
 *   getById: (id: string) => Promise<{ source?: string, rate: number } | null>,
 *   readLive: () => Promise<{ rate: number } | null>,
 *   listUpTo?: (at: Date) => Promise<Array<{ rate: number, fetchedAt: string|Date }>>,
 * }} deps
 * @param {Date} [paidAt]
 * @returns {Promise<{ quote: { rate: number } } | { error: { status: number, message: string } }>}
 */
export async function resolvePaymentQuote(rateId, deps, paidAt) {
  if (rateId) {
    const picked = await deps.getById(rateId)
    if (!picked || picked.source !== 'BCV' || !(picked.rate > 0)) {
      return { error: { status: 422, message: 'Tasa seleccionada inválida' } }
    }
    return { quote: picked }
  }

  if (paidAt) {
    const rates = await deps.listUpTo(paidAt)
    return resolveRateAt(rates, paidAt)
  }

  const live = await deps.readLive()
  if (!live || !(live.rate > 0)) {
    return {
      error: {
        status: 503,
        message:
          'No hay tasa BCV disponible. Espere a que corra el job de tasas o configure el fetch.',
      },
    }
  }
  return { quote: live }
}

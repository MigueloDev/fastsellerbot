/**
 * Cotización BCV para un pago:
 * - rateId → tasa histórica elegida en el dashboard (p. ej. pago de ayer cargado hoy)
 * - sin rateId → live de readRate (comportamiento original)
 *
 * @param {string|null|undefined} rateId
 * @param {{
 *   getById: (id: string) => Promise<{ source?: string, rate: number } | null>,
 *   readLive: () => Promise<{ rate: number } | null>,
 * }} deps
 * @returns {Promise<{ quote: { rate: number } } | { error: { status: number, message: string } }>}
 */
export async function resolvePaymentQuote(rateId, deps) {
  if (rateId) {
    const picked = await deps.getById(rateId)
    if (!picked || picked.source !== 'BCV' || !(picked.rate > 0)) {
      return { error: { status: 422, message: 'Tasa seleccionada inválida' } }
    }
    return { quote: picked }
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

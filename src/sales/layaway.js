import { PAYMENT_TOLERANCE, round2 } from './balance.js'

const TZ = 'America/Caracas'
const DAY_MS = 86_400_000

/** 'YYYY-MM-DD' del día en Caracas (las fechas límite son por día, no por hora). */
export function dayKey(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ })
}

function addDays(d, n) {
  return new Date(new Date(d).getTime() + n * DAY_MS)
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

/**
 * Cronograma de un apartado recalculado con los pagos reales.
 * Invariante: Σ expectedUsd = totalUsd.
 * - Filas vencidas: expectedUsd = lo pagado en ese período (lo que faltó se corre a las siguientes).
 * - Inicial abierta: max(inicial pactada, lo pagado).
 * - Cuotas abiertas: el saldo restante se reparte en partes iguales; si una cuota
 *   abierta ya tiene más pagado que su parte, queda en lo pagado y el resto se reparte.
 *
 * @param {{
 *   totalUsd: *,
 *   layaway: { startAt: *, downPaymentUsd: *, installments: number, everyDays: number, deadlineDays: number, penaltyPct: * },
 *   payments?: Array<{ amountUsd: *, paidAt: * }>,
 *   now?: Date|string|number,
 * }} input
 */
export function layawaySchedule({ totalUsd, layaway, payments = [], now = new Date() }) {
  const total = round2(toNum(totalUsd))
  const down = round2(toNum(layaway.downPaymentUsd))
  const n = Math.max(1, Math.trunc(layaway.installments))
  const startAt = new Date(layaway.startAt)

  const rows = Array.from({ length: n + 1 }, (_, i) => {
    const dueAt = addDays(startAt, i * layaway.everyDays)
    return {
      label: i === 0 ? 'Inicial' : `Cuota ${i}`,
      dueAt: dueAt.toISOString(),
      dueDay: dayKey(dueAt),
      expectedUsd: 0,
      paidUsd: 0,
      payments: [],
    }
  })

  const sorted = [...payments].sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))
  for (const p of sorted) {
    const day = dayKey(p.paidAt)
    const row = rows.find((r) => day <= r.dueDay) ?? rows[n]
    row.paidUsd = round2(row.paidUsd + toNum(p.amountUsd))
    row.payments.push(p)
  }

  const today = dayKey(now)
  const firstOpen = Math.min(
    rows.findIndex((r) => r.dueDay >= today) === -1 ? n : rows.findIndex((r) => r.dueDay >= today),
    n,
  )

  let pool = total
  for (let i = 0; i < firstOpen; i++) {
    rows[i].expectedUsd = rows[i].paidUsd
    pool = round2(pool - rows[i].paidUsd)
  }
  for (let i = firstOpen; i <= n; i++) {
    const row = rows[i]
    if (i === n) {
      row.expectedUsd = round2(Math.max(pool, row.paidUsd))
      break
    }
    // Trunca a centavos: la última cuota absorbe el resto.
    const share = i === 0 ? down : Math.floor(Math.round(pool * 100) / (n - i + 1)) / 100
    row.expectedUsd = round2(Math.max(share, row.paidUsd, 0))
    pool = round2(pool - row.expectedUsd)
  }

  const paidUsd = round2(rows.reduce((s, r) => s + r.paidUsd, 0))
  const remainingUsd = round2(Math.max(0, total - paidUsd))
  const deadlineAt = addDays(startAt, layaway.deadlineDays)
  const settled = remainingUsd <= PAYMENT_TOLERANCE

  for (const [i, r] of rows.entries()) {
    const owed = round2(r.expectedUsd - r.paidUsd)
    r.status =
      owed <= PAYMENT_TOLERANCE ? (r.expectedUsd > 0 || settled ? 'PAGADA' : 'SIN_PAGO')
      : r.paidUsd > 0 ? 'PARCIAL'
      : i < firstOpen ? 'SIN_PAGO'
      : 'PENDIENTE'
  }
  const nextIdx = settled ? -1 : rows.findIndex((r, i) => i >= firstOpen && r.expectedUsd - r.paidUsd > PAYMENT_TOLERANCE)
  const next = nextIdx === -1 ? null : {
    index: nextIdx,
    label: rows[nextIdx].label,
    dueAt: rows[nextIdx].dueAt,
    amountUsd: round2(rows[nextIdx].expectedUsd - rows[nextIdx].paidUsd),
  }

  return {
    rows: rows.map(({ dueDay, ...r }) => r),
    totalUsd: total,
    paidUsd,
    remainingUsd,
    deadlineAt: deadlineAt.toISOString(),
    overdue: !settled && today > dayKey(deadlineAt),
    penaltyUsd: round2(down * toNum(layaway.penaltyPct) / 100),
    next,
  }
}

/**
 * Valida términos de apartado contra el total. Devuelve mensaje de error o null.
 * @param {{ downPaymentUsd: number, installments: number, everyDays: number, deadlineDays: number, penaltyPct: number }} t
 * @param {number} totalUsd
 */
export function layawayTermsError(t, totalUsd) {
  if (!(t.downPaymentUsd > 0) || t.downPaymentUsd >= totalUsd) return 'La inicial debe ser mayor a 0 y menor al total'
  if (!Number.isInteger(t.installments) || t.installments < 1) return 'Número de cuotas inválido'
  if (!Number.isInteger(t.everyDays) || t.everyDays < 1) return 'Frecuencia de cuotas inválida'
  if (!Number.isInteger(t.deadlineDays) || t.deadlineDays < t.installments * t.everyDays) {
    return 'El plazo debe cubrir todas las cuotas'
  }
  if (!(t.penaltyPct >= 0 && t.penaltyPct <= 100)) return 'Penalidad inválida'
  return null
}

export const LAYAWAY_DEFAULTS = { installments: 4, everyDays: 7, deadlineDays: 30, penaltyPct: 20 }

/**
 * Normaliza `layaway` del body. null/undefined → venta normal.
 * @param {*} raw
 * @returns {{ layaway: null | { downPaymentUsd: number, installments: number, everyDays: number, deadlineDays: number, penaltyPct: number, serial: string|null }, error?: string }}
 */
export function normalizeLayaway(raw) {
  if (raw == null) return { layaway: null }
  if (typeof raw !== 'object') return { layaway: null, error: 'layaway inválido' }
  const serial = typeof raw.serial === 'string' ? raw.serial.trim() || null : null
  return {
    layaway: {
      downPaymentUsd: round2(Number(raw.downPaymentUsd)),
      installments: Number(raw.installments ?? LAYAWAY_DEFAULTS.installments),
      everyDays: Number(raw.everyDays ?? LAYAWAY_DEFAULTS.everyDays),
      deadlineDays: Number(raw.deadlineDays ?? LAYAWAY_DEFAULTS.deadlineDays),
      penaltyPct: Number(raw.penaltyPct ?? LAYAWAY_DEFAULTS.penaltyPct),
      serial,
    },
  }
}

/** @typedef {string | number | null | undefined} CsvValue */

const TZ = 'America/Caracas'

/**
 * Escapa un campo CSV (comillas, comas, saltos) + anti fórmula-injection.
 * Trust boundary: nombres de clientes y notas vienen del usuario.
 * @param {CsvValue} value
 */
function escapeField(value) {
  if (value == null) return ''
  let s = String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * @param {string[]} headers
 * @param {CsvValue[][]} rows
 */
export function toCsv(headers, rows) {
  return [headers, ...rows]
    .map((row) => row.map(escapeField).join(','))
    .join('\r\n')
}

function asDate(value) {
  return value instanceof Date ? value : new Date(value)
}

function csvDateTime(value) {
  return asDate(value).toLocaleString('es-VE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TZ,
  })
}

function csvDate(value) {
  return asDate(value).toLocaleDateString('es-VE', { timeZone: TZ })
}

function ymd(value) {
  return asDate(value).toLocaleDateString('en-CA', { timeZone: TZ })
}

function money(n) {
  if (n == null || n === '') return ''
  return Number(n).toFixed(2)
}

function periodLabel(period) {
  const from = period?.from ? csvDate(period.from) : ''
  const to = period?.to ? csvDate(period.to) : ''
  if (!from && !to) return 'Todo'
  if (from && to) return `${from} — ${to}`
  if (from) return `desde ${from}`
  return `hasta ${to}`
}

/**
 * @param {{ from?: Date, to?: Date }} [range]
 * @param {'detail' | 'summary'} [mode]
 */
export function fxCsvFilename(range = {}, mode = 'detail') {
  const suffix = mode === 'summary' ? '_resumen' : ''
  const from = range.from ? ymd(range.from) : ''
  const to = range.to ? ymd(range.to) : ''
  const span = from || to ? `_${from || '...'}_a_${to || '...'}` : ''
  return `divisas${suffix}${span}.csv`
}

/**
 * @param {{ period?: { from?: string|Date|null, to?: string|Date|null }, totals: Record<string, unknown> }} report
 */
export function buildFxSummaryCsv(report) {
  const t = report.totals
  return toCsv(
    ['Concepto', 'Valor'],
    [
      ['Período', periodLabel(report.period)],
      ['Ventas', t.count],
      ['Bs cobrados', money(t.bsCollected)],
      ['Bs convertidos', money(t.bsConverted)],
      ['Bs pendientes', money(t.bsPending)],
      ['USDT recibidos', t.usdtReceived],
      ['USD cobrados', money(t.usdCollected)],
      ['Ganancia USD', money(t.profitUsd)],
      ['Compras', t.purchasesCount],
      ['Bs gastados', money(t.purchasesBsSpent)],
      ['USDT comprados', t.purchasesUsdt],
    ],
  )
}

function salesBlock(report) {
  const t = report.totals
  const rows = report.sales.map((sale) => [
    csvDateTime(sale.createdAt),
    sale.customer?.name ?? '',
    sale.customer?.cedula ?? '',
    sale.paymentState ?? sale.status,
    money(sale.totalUsd),
    money(sale.bsCollected),
    money(sale.bsConverted),
    money(sale.bsPending),
    sale.usdtReceived,
    money(sale.usdCollected),
    money(sale.profitUsd),
  ])
  rows.push([
    'TOTAL',
    `${t.count} venta${t.count === 1 ? '' : 's'}`,
    '',
    '',
    '',
    money(t.bsCollected),
    money(t.bsConverted),
    money(t.bsPending),
    t.usdtReceived,
    money(t.usdCollected),
    money(t.profitUsd),
  ])
  return toCsv(
    [
      'Fecha',
      'Cliente',
      'Cédula',
      'Estado',
      'Total USD',
      'Bs cobrados',
      'Bs convertidos',
      'Bs pendientes',
      'USDT',
      'USD cobrados',
      'Ganancia USD',
    ],
    rows,
  )
}

function purchasesBlock(report) {
  const t = report.totals
  const rows = report.purchases.map((p) => [
    csvDateTime(p.purchasedAt),
    p.binanceRate,
    money(p.bsSpent),
    p.expectedUsdt ?? '',
    p.usdtReceived,
    p.diffUsdt ?? '',
    p.salesCount,
    p.agentName ?? '',
    p.note ?? '',
  ])
  rows.push([
    'TOTAL',
    `${t.purchasesCount} compra${t.purchasesCount === 1 ? '' : 's'}`,
    money(t.purchasesBsSpent),
    '',
    t.purchasesUsdt,
    '',
    '',
    '',
    '',
  ])
  return toCsv(
    [
      'Fecha',
      'Tasa Binance',
      'Bs gastados',
      'USDT esperado',
      'USDT recibido',
      'Dif USDT',
      'Ventas',
      'Agente',
      'Nota',
    ],
    rows,
  )
}

/**
 * Detalle (ventas + compras, sin IDs) + bloque Resumen al final.
 * @param {{ sales: object[], purchases: object[], totals: Record<string, unknown>, period?: object }} report
 */
export function buildFxDetailCsv(report) {
  const parts = []
  if (report.sales.length > 0) parts.push(salesBlock(report))
  if (report.purchases.length > 0) {
    parts.push(`Compras de divisas\r\n${purchasesBlock(report)}`)
  }
  parts.push(`Resumen\r\n${buildFxSummaryCsv(report)}`)
  return parts.join('\r\n\r\n')
}

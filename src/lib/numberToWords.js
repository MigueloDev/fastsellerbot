const UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE']
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function below1000(n) {
  if (n === 100) return 'CIEN'
  const h = Math.floor(n / 100)
  const rest = n % 100
  let tail = ''
  if (rest < 30) tail = UNITS[rest]
  else tail = TENS[Math.floor(rest / 10)] + (rest % 10 ? ` Y ${UNITS[rest % 10]}` : '')
  return [HUNDREDS[h], tail].filter(Boolean).join(' ')
}

/** "VEINTIUNO MIL" → "VEINTIÚN MIL", "UNO DÓLARES" → "UN DÓLARES". */
function apocope(s) {
  return s.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN')
}

/** Entero (0 ≤ n < 1e9) en letras, en mayúsculas. "UNO" queda en masculino genérico. */
export function intToWords(n) {
  n = Math.trunc(n)
  if (n === 0) return 'CERO'
  const millions = Math.floor(n / 1e6)
  const thousands = Math.floor((n % 1e6) / 1000)
  const rest = n % 1000
  const parts = []
  if (millions) parts.push(millions === 1 ? 'UN MILLÓN' : `${apocope(below1000(millions))} MILLONES`)
  if (thousands) parts.push(thousands === 1 ? 'MIL' : `${apocope(below1000(thousands))} MIL`)
  if (rest) parts.push(below1000(rest))
  return parts.join(' ')
}

/**
 * Monto en USD en letras para contratos: 125 → "CIENTO VEINTICINCO DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA".
 * Centavos: "CON 50/100".
 * @param {number} amount
 */
export function usdToWords(amount) {
  const cents = Math.round(amount * 100) % 100
  const int = Math.floor(Math.round(amount * 100) / 100)
  const words = int === 1 ? 'UN DÓLAR' : `${apocope(intToWords(int))} DÓLARES`
  return `${words}${cents ? ` CON ${String(cents).padStart(2, '0')}/100` : ''} DE LOS ESTADOS UNIDOS DE AMÉRICA`
}

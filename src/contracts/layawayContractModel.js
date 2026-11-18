import { intToWords, usdToWords } from '../lib/numberToWords.js'
import { layawaySchedule } from '../sales/layaway.js'

// Texto del contrato: "estático", se cambia aquí en código.
export const COMPANY = {
  name: 'LA SUPLIDORA COMERCIALIZADORA, C.A.',
  rif: 'J-40943897-0',
  address: 'Av. Jofre Paul Jatem, esquina calle Progreso, Local Nro. 1, Sector Santa Irene, Punto Fijo, estado Falcón, Zona Postal 4102',
  city: 'Punto Fijo',
}

const TZ = 'America/Caracas'
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

const num2 = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const usd = (n) => `USD ${num2.format(n)}`
const bs = (n) => `Bs. ${num2.format(n)}`

function dateParts(d) {
  const [y, m, day] = new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }).split('-').map(Number)
  return { y, m, day }
}
export function fmtDate(d) {
  const { y, m, day } = dateParts(d)
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

/** "cuatro (4)" */
const countWords = (n) => `${intToWords(n).toLowerCase()} (${n})`

function periodLabel(everyDays) {
  if (everyDays === 7) return 'semanales'
  if (everyDays === 14 || everyDays === 15) return 'quincenales'
  if (everyDays === 30) return 'mensuales'
  return `cada ${countWords(everyDays)} días`
}

function paymentLine(p) {
  if (p.currency === 'BS') return `${bs(p.amount)} / ${p.rateUsed != null ? num2.format(p.rateUsed) : '—'}`
  return `${usd(p.amount)} (${p.method.replace('_', ' ').toLowerCase()})`
}

/**
 * Todo lo que se imprime, ya interpolado. Puro: el PDF solo dibuja esto.
 * @param {object} sale venta serializada (con customer, items, payments, layaway)
 * @param {Date} [now]
 */
export function layawayContractModel(sale, now = new Date()) {
  const lay = sale.layaway
  const c = sale.customer
  const schedule = layawaySchedule({ totalUsd: sale.totalUsd, layaway: lay, payments: sale.payments, now })
  // Cláusula TERCERA = lo pactado al firmar (cronograma sin pagos).
  const baseline = layawaySchedule({ totalUsd: sale.totalUsd, layaway: lay, payments: [], now: lay.startAt })
  const cuota = baseline.rows[1].expectedUsd
  const sign = dateParts(lay.startAt)

  const products = sale.items
    .map((it) => [it.product?.name, it.variant?.name && `modelo: ${it.variant.name}`].filter(Boolean).join(', ')
      + (it.quantity > 1 ? ` × ${it.quantity}` : ''))
    .join('; ')

  const clauses = [
    ['PRIMERA. OBJETO.', 'LA EMPRESA se compromete a reservar a nombre de EL CLIENTE el producto descrito en este contrato, y a entregárselo una vez que EL CLIENTE haya pagado la totalidad del precio en los términos aquí establecidos. Mientras dure el apartado, el producto no será vendido a terceros.'],
    ['SEGUNDA. PRECIO.', `El precio total del producto es de ${usdToWords(schedule.totalUsd)} (${usd(schedule.totalUsd)}), pagaderos en bolívares a la tasa oficial publicada por el Banco Central de Venezuela (BCV) vigente el día de cada pago. El precio pactado no está sujeto a negociación ni a modificación durante la vigencia del apartado.`],
    ['TERCERA. FORMA DE PAGO.', `EL CLIENTE pagará el precio de la siguiente manera: (a) una inicial de ${usd(lay.downPaymentUsd)} al momento de firmar este contrato; y (b) ${countWords(lay.installments)} cuota${lay.installments > 1 ? 's' : ''} ${periodLabel(lay.everyDays)} de ${usd(cuota)}${lay.installments > 1 ? ' cada una' : ''}, según el cronograma de pagos incluido en este documento. EL CLIENTE podrá adelantar cuotas o pagar el saldo total en cualquier momento, sin penalidad. Si EL CLIENTE abona un monto mayor o menor al de una cuota, el saldo restante se redistribuye en partes iguales entre las cuotas pendientes, según se refleja en el cronograma.`],
    ['CUARTA. PLAZO MÁXIMO.', `EL CLIENTE dispone de un plazo máximo de ${countWords(lay.deadlineDays)} días continuos contados a partir de la fecha de firma de este contrato para completar el pago total del precio.`],
    ['QUINTA. ENTREGA.', 'El producto será entregado a EL CLIENTE una vez completado y verificado el pago total del precio. EL CLIENTE recibirá el producto nuevo, en su empaque original, y deberá revisarlo al momento de la entrega. La propiedad del producto se transfiere a EL CLIENTE con el pago total y la entrega.'],
    ['SEXTA. INCUMPLIMIENTO Y DEVOLUCIÓN.', `Si al vencer el plazo de ${countWords(lay.deadlineDays)} días EL CLIENTE no ha completado el pago total, el presente contrato quedará resuelto de pleno derecho, el producto quedará liberado y LA EMPRESA devolverá a EL CLIENTE el monto total abonado, descontando una penalidad equivalente al ${num2.format(lay.penaltyPct).replace(',00', '')} % del monto de la inicial, es decir, ${usd(schedule.penaltyUsd)}. La devolución se hará en bolívares a la tasa oficial del BCV vigente el día del reintegro, dentro de los cinco (5) días hábiles siguientes al vencimiento del plazo. Esta misma penalidad se aplicará si EL CLIENTE decide voluntariamente desistir del apartado antes de completar el pago.`],
    ['SÉPTIMA. COMPROBANTES DE PAGO.', 'Cada pago será registrado en el cronograma de este contrato y respaldado con su comprobante (referencia de pago móvil, transferencia o recibo). EL CLIENTE debe enviar el comprobante de cada pago por WhatsApp o entregarlo en físico. Solo se considerarán válidos los pagos realizados a las cuentas indicadas por LA EMPRESA.'],
    ['OCTAVA. GARANTÍA.', 'El producto cuenta con la garantía que establezca el fabricante, la cual comenzará a correr desde la fecha de entrega. La garantía no cubre daños por mal uso, golpes, humedad o manipulación por terceros no autorizados.'],
    ['NOVENA. FIRMA DIGITAL.', 'Las partes aceptan que este contrato puede ser suscrito y enviado en formato digital (fotografía, PDF o aceptación por mensaje de datos), con la misma validez que el documento firmado en físico, conforme a la legislación venezolana sobre mensajes de datos y firmas electrónicas.'],
    ['DÉCIMA. DOMICILIO.', `Para todos los efectos derivados de este contrato, las partes eligen como domicilio especial la ciudad de ${COMPANY.city}, estado Falcón.`],
  ]

  const STATUS = { PAGADA: 'Pagada', PARCIAL: 'Parcial', SIN_PAGO: 'Sin pago', PENDIENTE: '' }
  const scheduleRows = schedule.rows.map((r, i) => [
    r.label,
    `${i === 0 ? 'Al firmar' : `Día ${i * lay.everyDays}`}  ${fmtDate(r.dueAt)}`,
    num2.format(r.expectedUsd),
    r.payments.map(paymentLine).join('\n'),
    [r.payments.map((p) => p.note).filter(Boolean).join('\n'), STATUS[r.status]].filter(Boolean).join('\n'),
  ])
  scheduleRows.push([
    'TOTAL',
    `Máx. día ${lay.deadlineDays}  ${fmtDate(schedule.deadlineAt)}`,
    num2.format(schedule.totalUsd),
    `Abonado: ${usd(schedule.paidUsd)}`,
    schedule.remainingUsd > 0 ? `Resta: ${usd(schedule.remainingUsd)}` : 'Pagado',
  ])

  return {
    company: COMPANY,
    number: String(lay.number).padStart(5, '0'),
    customer: [
      ['Nombre y apellido:', c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()],
      ['Cédula de identidad:', c.cedula ?? ''],
      ['Teléfono / WhatsApp:', c.phone ?? ''],
      ['Dirección:', c.address ?? ''],
      ['Producto apartado:', products],
      ['Serial (si aplica):', lay.serial ?? ''],
      ['Fecha de firma:', fmtDate(lay.startAt)],
    ],
    intro: `Entre ${COMPANY.name}, inscrita en el Registro Único de Información Fiscal bajo el N° ${COMPANY.rif}, con domicilio fiscal en ${COMPANY.city}, estado Falcón, en adelante “LA EMPRESA”, y la persona identificada a continuación, en adelante “EL CLIENTE”, se ha convenido celebrar el presente contrato de venta por apartado, que se regirá por las siguientes cláusulas:`,
    clauses,
    scheduleHeader: ['Pago', 'Fecha límite', 'Monto (USD)', 'Monto pagado (Bs) / Tasa BCV', 'Referencia / Estado'],
    scheduleRows,
    scheduleNote: `Los montos en dólares se pagan en bolívares a la tasa oficial del BCV del día de cada pago. Los días se cuentan a partir de la fecha de firma. Cronograma actualizado al ${fmtDate(now)}.`,
    closing: `Se firman dos (2) ejemplares de un mismo tenor y a un solo efecto, en ${COMPANY.city}, a los ${sign.day} días del mes de ${MONTHS[sign.m - 1]} de ${sign.y}.`,
    clientName: c.name ?? '',
    clientCedula: c.cedula ?? '',
    overdue: schedule.overdue,
  }
}

import PDFDocument from 'pdfkit'
import { layawayContractModel } from './layawayContractModel.js'

const MARGIN = 50
const BODY = 9.5

/**
 * Contrato de venta por apartado en PDF, armado al vuelo con los pagos actuales.
 * @param {object} sale venta serializada (findSale)
 * @returns {Promise<Buffer>}
 */
export function renderLayawayContract(sale) {
  const m = layawayContractModel(sale)
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN, info: { Title: `Contrato de apartado N° ${m.number}` } })
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const width = doc.page.width - MARGIN * 2

  // Encabezado
  doc.font('Helvetica-Bold').fontSize(13).text(m.company.name, { align: 'center' })
  doc.font('Helvetica').fontSize(8.5).text(`RIF: ${m.company.rif}`, { align: 'center' })
  doc.text(m.company.address, { align: 'center' })
  doc.moveDown(0.8)
  doc.font('Helvetica-Bold').fontSize(12).text('CONTRATO DE VENTA POR APARTADO', { align: 'center' })
  doc.font('Helvetica').fontSize(BODY).text(`N° de contrato: ${m.number}`, { align: 'center' })
  doc.moveDown(0.8)
  doc.text(m.intro, { align: 'justify' })
  doc.moveDown(0.6)

  // Datos del cliente y del producto
  doc.font('Helvetica-Bold').text('DATOS DEL CLIENTE Y DEL PRODUCTO')
  doc.moveDown(0.3)
  for (const [label, value] of m.customer) {
    doc.font('Helvetica-Bold').text(`${label} `, { continued: true }).font('Helvetica').text(value || '______________________')
  }
  doc.moveDown(0.6)

  // Cláusulas
  for (const [title, body] of m.clauses) {
    doc.font('Helvetica-Bold').text(`${title} `, { continued: true, align: 'justify' })
      .font('Helvetica').text(body, { align: 'justify' })
    doc.moveDown(0.4)
  }

  // Cronograma
  doc.moveDown(0.4)
  doc.font('Helvetica-Bold').fontSize(10.5).text('CRONOGRAMA DE PAGOS', MARGIN, doc.y, { align: 'center', width })
  doc.moveDown(0.4)
  const cols = [0.12, 0.2, 0.13, 0.28, 0.27].map((f) => f * width)
  drawRow(doc, cols, m.scheduleHeader, { bold: true, fill: '#eeeeee' })
  m.scheduleRows.forEach((row, i) => drawRow(doc, cols, row, { bold: i === m.scheduleRows.length - 1 }))
  doc.moveDown(0.4)
  doc.font('Helvetica').fontSize(8).text(m.scheduleNote, MARGIN, doc.y, { width })
  if (m.overdue) {
    doc.moveDown(0.3).font('Helvetica-Bold').fillColor('#b91c1c')
      .text('Plazo vencido: aplica la cláusula SEXTA.', { width }).fillColor('black')
  }

  // Cierre y firmas
  doc.moveDown(0.8).font('Helvetica').fontSize(BODY).text(m.closing, MARGIN, doc.y, { width, align: 'justify' })
  if (doc.y > doc.page.height - MARGIN - 150) doc.addPage()
  const y = doc.y + 50
  const half = width / 2 - 15
  signature(doc, MARGIN, y, half, ['LA EMPRESA', m.company.name, `RIF: ${m.company.rif}`, 'Nombre: ______________________', 'C.I.: ______________________'])
  signature(doc, MARGIN + half + 30, y, half, ['EL CLIENTE', `Nombre: ${m.clientName || '______________________'}`, `C.I.: ${m.clientCedula || '______________________'}`, 'Huella:'])
  doc.rect(MARGIN + half + 30, y + 75, 60, 70).stroke()

  doc.end()
  return done
}

function drawRow(doc, cols, cells, { bold = false, fill = null } = {}) {
  const pad = 4
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
  const h = Math.max(...cells.map((t, i) => doc.heightOfString(t || ' ', { width: cols[i] - pad * 2 }))) + pad * 2
  if (doc.y + h > doc.page.height - MARGIN) doc.addPage()
  const y = doc.y
  let x = MARGIN
  cells.forEach((text, i) => {
    if (fill) doc.rect(x, y, cols[i], h).fill(fill).fillColor('black')
    doc.rect(x, y, cols[i], h).stroke()
    doc.text(text || '', x + pad, y + pad, { width: cols[i] - pad * 2 })
    x += cols[i]
  })
  doc.x = MARGIN
  doc.y = y + h
}

function signature(doc, x, y, w, lines) {
  doc.moveTo(x, y).lineTo(x + w, y).stroke()
  doc.font('Helvetica-Bold').fontSize(BODY).text(lines[0], x, y + 4, { width: w, align: 'center' })
  doc.font('Helvetica').fontSize(8.5)
  for (const l of lines.slice(1)) doc.text(l, x, doc.y, { width: w, align: 'center' })
}

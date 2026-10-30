/** WebP RIFF signature: RIFF....WEBP */
const WEBP_SIG = Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF
const WEBP_FMT = Buffer.from([0x57, 0x45, 0x42, 0x50]) // WEBP at offset 8
const PDF_SIG = Buffer.from('%PDF-')

const FILE_TYPES = {
  'image/webp': {
    maxBytes: 5 * 1024 * 1024,
    ext: 'webp',
    check: assertWebp,
  },
  'application/pdf': {
    maxBytes: 10 * 1024 * 1024,
    ext: 'pdf',
    check: assertPdf,
  },
}

/** Max receipt payload size after base64 decode (WebP, retro-compat con callers viejos). */
export const RECEIPT_MAX_BYTES = FILE_TYPES['image/webp'].maxBytes

/**
 * Decode an optional base64 file from a JSON body.
 * Accepts raw base64 or a `data:<mime>;base64,...` data URL (el mime del
 * data URL debe coincidir con `contentType` si se manda).
 *
 * @param {unknown} fileBase64
 * @param {string} contentType `image/webp` | `application/pdf`
 * @returns {{ buffer: Buffer, contentType: string, ext: string } | null}
 */
export function parseFileBase64(fileBase64, contentType = 'image/webp') {
  if (fileBase64 == null || fileBase64 === '') return null
  if (typeof fileBase64 !== 'string') {
    throw new ReceiptError(422, 'fileBase64 debe ser string')
  }
  const type = FILE_TYPES[contentType]
  if (!type) {
    throw new ReceiptError(422, `contentType no soportado: ${contentType}`)
  }

  let b64 = fileBase64.trim()
  const dataUrl = /^data:([\w./+-]+);base64,(.+)$/i.exec(b64)
  if (dataUrl) {
    const mime = dataUrl[1].toLowerCase()
    if (mime !== contentType) {
      throw new ReceiptError(422, `El archivo debe ser ${contentType}`)
    }
    b64 = dataUrl[2]
  }

  let buffer
  try {
    buffer = Buffer.from(b64, 'base64')
  } catch {
    throw new ReceiptError(422, 'fileBase64 inválido')
  }

  if (!buffer.length) {
    throw new ReceiptError(422, 'Archivo vacío')
  }
  if (buffer.length > type.maxBytes) {
    throw new ReceiptError(422, `Archivo supera ${type.maxBytes} bytes`)
  }

  type.check(buffer)
  return { buffer, contentType, ext: type.ext }
}

/**
 * Comprobante de pago: WebP por defecto (retro-compat dashboard), o PDF si
 * se manda `receiptContentType`.
 * @param {unknown} receiptBase64
 * @param {string} [contentType]
 * @returns {{ buffer: Buffer, contentType: string, ext: string } | null}
 */
export function parseReceiptBase64(receiptBase64, contentType = 'image/webp') {
  return parseFileBase64(receiptBase64, contentType)
}

/**
 * @param {Buffer} buf
 */
export function assertWebp(buf) {
  if (
    buf.length < 12 ||
    !buf.subarray(0, 4).equals(WEBP_SIG) ||
    !buf.subarray(8, 12).equals(WEBP_FMT)
  ) {
    throw new ReceiptError(422, 'El archivo no es un WebP válido')
  }
}

/**
 * @param {Buffer} buf
 */
export function assertPdf(buf) {
  if (buf.length < PDF_SIG.length || !buf.subarray(0, PDF_SIG.length).equals(PDF_SIG)) {
    throw new ReceiptError(422, 'El archivo no es un PDF válido')
  }
}

export class ReceiptError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'ReceiptError'
    this.status = status
  }
}

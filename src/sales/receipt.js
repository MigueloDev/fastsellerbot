/** Max receipt payload size after base64 decode (5 MiB). */
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024

/** WebP RIFF signature: RIFF....WEBP */
const WEBP_SIG = Buffer.from([0x52, 0x49, 0x46, 0x46]) // RIFF
const WEBP_FMT = Buffer.from([0x57, 0x45, 0x42, 0x50]) // WEBP at offset 8

/**
 * Decode optional receipt from JSON body.
 * Accepts raw base64 or `data:image/webp;base64,...`.
 * @param {unknown} receiptBase64
 * @returns {{ buffer: Buffer, contentType: 'image/webp' } | null}
 */
export function parseReceiptBase64(receiptBase64) {
  if (receiptBase64 == null || receiptBase64 === '') return null
  if (typeof receiptBase64 !== 'string') {
    throw new ReceiptError(422, 'receiptBase64 debe ser string')
  }

  let b64 = receiptBase64.trim()
  const dataUrl = /^data:(image\/[\w+.-]+);base64,(.+)$/i.exec(b64)
  if (dataUrl) {
    const mime = dataUrl[1].toLowerCase()
    if (mime !== 'image/webp') {
      throw new ReceiptError(422, 'El comprobante debe ser image/webp')
    }
    b64 = dataUrl[2]
  }

  let buffer
  try {
    buffer = Buffer.from(b64, 'base64')
  } catch {
    throw new ReceiptError(422, 'receiptBase64 inválido')
  }

  if (!buffer.length) {
    throw new ReceiptError(422, 'Comprobante vacío')
  }
  if (buffer.length > RECEIPT_MAX_BYTES) {
    throw new ReceiptError(422, `Comprobante supera ${RECEIPT_MAX_BYTES} bytes`)
  }

  assertWebp(buffer)
  return { buffer, contentType: 'image/webp' }
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

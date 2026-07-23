import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertWebp,
  parseReceiptBase64,
  ReceiptError,
  RECEIPT_MAX_BYTES,
} from './receipt.js'

/** Minimal valid WebP (RIFF + size + WEBP + VP8 chunk stub). */
function minimalWebp(extraBytes = 0) {
  const payload = Buffer.alloc(12 + extraBytes, 0)
  payload.write('RIFF', 0)
  payload.writeUInt32LE(4 + extraBytes, 4) // file size minus 8
  payload.write('WEBP', 8)
  return payload
}

describe('receipt', () => {
  it('accepts raw base64 WebP', () => {
    const buf = minimalWebp()
    const parsed = parseReceiptBase64(buf.toString('base64'))
    assert.equal(parsed.contentType, 'image/webp')
    assert.ok(parsed.buffer.equals(buf))
  })

  it('accepts data URL WebP', () => {
    const buf = minimalWebp()
    const parsed = parseReceiptBase64(
      `data:image/webp;base64,${buf.toString('base64')}`,
    )
    assert.ok(parsed.buffer.equals(buf))
  })

  it('rejects non-webp data URL mime', () => {
    assert.throws(
      () => parseReceiptBase64('data:image/png;base64,aaaa'),
      (err) => err instanceof ReceiptError && /webp/i.test(err.message),
    )
  })

  it('rejects non-webp bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.throws(
      () => parseReceiptBase64(png.toString('base64')),
      (err) => err instanceof ReceiptError && /WebP/i.test(err.message),
    )
  })

  it('rejects oversized payload', () => {
    const buf = minimalWebp(RECEIPT_MAX_BYTES) // total > max
    assert.ok(buf.length > RECEIPT_MAX_BYTES)
    assert.throws(
      () => parseReceiptBase64(buf.toString('base64')),
      (err) => err instanceof ReceiptError && /supera/i.test(err.message),
    )
  })

  it('returns null for empty/missing', () => {
    assert.equal(parseReceiptBase64(null), null)
    assert.equal(parseReceiptBase64(''), null)
  })

  it('assertWebp throws on short buffer', () => {
    assert.throws(() => assertWebp(Buffer.from('RIFF')), ReceiptError)
  })
})

import { it } from 'node:test'
import assert from 'node:assert/strict'
import { signContractToken, verifyContractToken } from './linkToken.js'

const secret = 'test-secret-0123456789'

it('token válido devuelve el saleId; cada firma es distinta', () => {
  const a = signContractToken('sale_1', { now: 1000, ttlMs: 60_000, secret })
  const b = signContractToken('sale_1', { now: 2000, ttlMs: 60_000, secret })
  assert.notEqual(a.token, b.token)
  assert.equal(verifyContractToken(a.token, { now: 5000, secret }), 'sale_1')
})

it('expirado, alterado u otro secreto → null', () => {
  const { token } = signContractToken('sale_1', { now: 1000, ttlMs: 60_000, secret })
  assert.equal(verifyContractToken(token, { now: 61_001, secret }), null)
  assert.equal(verifyContractToken(`${token}x`, { now: 5000, secret }), null)
  const forged = `${Buffer.from('sale_2.999999999999').toString('base64url')}.${token.split('.')[1]}`
  assert.equal(verifyContractToken(forged, { now: 5000, secret }), null)
  assert.equal(verifyContractToken(token, { now: 5000, secret: 'otro-secreto-0123456789' }), null)
  assert.equal(verifyContractToken('basura', { secret }), null)
})

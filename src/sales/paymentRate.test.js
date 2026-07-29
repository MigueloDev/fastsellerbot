import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePaymentQuote } from './paymentRate.js'

const liveQuote = { rate: 36.5 }
const histQuote = { id: 'r1', source: 'BCV', rate: 36.52 }

describe('resolvePaymentQuote', () => {
  it('sin rateId usa la tasa live', async () => {
    const res = await resolvePaymentQuote(null, {
      getById: async () => {
        throw new Error('no debería llamarse')
      },
      readLive: async () => liveQuote,
    })
    assert.deepEqual(res, { quote: liveQuote })
  })

  it('sin rateId y sin live → 503', async () => {
    const res = await resolvePaymentQuote(null, {
      getById: async () => null,
      readLive: async () => null,
    })
    assert.equal(res.error.status, 503)
  })

  it('con rateId usa la tasa histórica BCV', async () => {
    const res = await resolvePaymentQuote('r1', {
      getById: async (id) => (id === 'r1' ? histQuote : null),
      readLive: async () => {
        throw new Error('no debería llamarse')
      },
    })
    assert.deepEqual(res, { quote: histQuote })
  })

  it('rateId inexistente o no-BCV → 422', async () => {
    const deps = (row) => ({
      getById: async () => row,
      readLive: async () => liveQuote,
    })
    assert.equal((await resolvePaymentQuote('x', deps(null))).error.status, 422)
    assert.equal(
      (await resolvePaymentQuote('x', deps({ id: 'x', source: 'BINANCE', rate: 40 }))).error
        .status,
      422,
    )
    assert.equal(
      (await resolvePaymentQuote('x', deps({ id: 'x', source: 'BCV', rate: 0 }))).error.status,
      422,
    )
  })
})

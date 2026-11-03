import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parsePaidAt, resolvePaymentQuote, resolveRateAt } from './paymentRate.js'

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

  it('con paidAt (sin rateId) usa listUpTo + resolveRateAt', async () => {
    const paidAt = new Date('2026-10-20T12:00:00Z')
    const res = await resolvePaymentQuote(
      null,
      {
        getById: async () => {
          throw new Error('no debería llamarse')
        },
        readLive: async () => {
          throw new Error('no debería llamarse')
        },
        listUpTo: async (at) => {
          assert.equal(at.getTime(), paidAt.getTime())
          return [{ rate: 40, fetchedAt: '2026-10-20T10:00:00Z' }]
        },
      },
      paidAt,
    )
    assert.deepEqual(res, { quote: { rate: 40, fetchedAt: '2026-10-20T10:00:00Z' } })
  })

  it('con paidAt sin tasas disponibles → 422', async () => {
    const paidAt = new Date('2026-10-20T12:00:00Z')
    const res = await resolvePaymentQuote(
      null,
      { getById: async () => null, readLive: async () => null, listUpTo: async () => [] },
      paidAt,
    )
    assert.equal(res.error.status, 422)
  })
})

describe('parsePaidAt', () => {
  const now = new Date('2026-10-24T12:00:00Z')

  it('sin raw usa now', () => {
    assert.deepEqual(parsePaidAt(null, { now }), { paidAt: now })
  })

  it('fecha inválida → 422', () => {
    assert.equal(parsePaidAt('no-es-fecha', { now }).error.status, 422)
  })

  it('más de 5 min en el futuro → 422', () => {
    const future = new Date(now.getTime() + 6 * 60 * 1000).toISOString()
    assert.equal(parsePaidAt(future, { now }).error.status, 422)
  })

  it('dentro de la tolerancia de reloj (≤5 min futuro) pasa', () => {
    const future = new Date(now.getTime() + 4 * 60 * 1000).toISOString()
    const res = parsePaidAt(future, { now })
    assert.equal(res.error, undefined)
  })

  it('más viejo que maxDays → 422', () => {
    const tooOld = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    assert.equal(parsePaidAt(tooOld, { now, maxDays: 7 }).error.status, 422)
  })

  it('dentro de maxDays pasa', () => {
    const ok = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const res = parsePaidAt(ok, { now, maxDays: 7 })
    assert.equal(res.paidAt.toISOString(), ok)
  })
})

describe('resolveRateAt', () => {
  const rates = [
    { rate: 36, fetchedAt: '2026-10-20T08:00:00Z' },
    { rate: 37, fetchedAt: '2026-10-22T08:00:00Z' },
    { rate: 38, fetchedAt: '2026-10-24T08:00:00Z' },
  ]

  it('elige la más reciente con fetchedAt <= paidAt', () => {
    const res = resolveRateAt(rates, new Date('2026-10-23T00:00:00Z'))
    assert.equal(res.quote.rate, 37)
  })

  it('borde exacto fetchedAt === paidAt cuenta', () => {
    const res = resolveRateAt(rates, new Date('2026-10-22T08:00:00Z'))
    assert.equal(res.quote.rate, 37)
  })

  it('sin tasas → error', () => {
    assert.equal(resolveRateAt([], new Date()).error.status, 422)
  })

  it('paidAt antes de la primera tasa → error', () => {
    const res = resolveRateAt(rates, new Date('2026-10-19T00:00:00Z'))
    assert.ok(res.error)
  })
})

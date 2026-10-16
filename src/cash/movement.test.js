import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CashError,
  normalizeCashMovement,
  nextBalance,
  pickDefaultAccount,
  assertAccountForPayment,
  assertAccountsForConversion,
} from './movement.js'

describe('normalizeCashMovement', () => {
  it('ENTRADA suma (delta positivo)', () => {
    assert.deepEqual(normalizeCashMovement({ type: 'ENTRADA', amount: 10.5 }), {
      type: 'ENTRADA',
      reason: 'MANUAL',
      amount: 10.5,
      delta: 10.5,
    })
  })

  it('SALIDA resta (delta negativo)', () => {
    assert.deepEqual(normalizeCashMovement({ type: 'SALIDA', amount: 3 }), {
      type: 'SALIDA',
      reason: 'MANUAL',
      amount: 3,
      delta: -3,
    })
  })

  it('ENTRADA/SALIDA amount ≤ 0 lanza 422', () => {
    assert.throws(
      () => normalizeCashMovement({ type: 'ENTRADA', amount: 0 }),
      (err) => err instanceof CashError && err.status === 422,
    )
    assert.throws(
      () => normalizeCashMovement({ type: 'SALIDA', amount: -1 }),
      (err) => err instanceof CashError && err.status === 422,
    )
  })

  it('AJUSTE acepta delta + y −', () => {
    assert.deepEqual(normalizeCashMovement({ type: 'AJUSTE', delta: 12.34 }), {
      type: 'AJUSTE',
      reason: 'MANUAL',
      amount: 12.34,
      delta: 12.34,
    })
    assert.deepEqual(normalizeCashMovement({ type: 'AJUSTE', delta: -8 }), {
      type: 'AJUSTE',
      reason: 'MANUAL',
      amount: 8,
      delta: -8,
    })
  })

  it('GASTO solo SALIDA', () => {
    assert.deepEqual(
      normalizeCashMovement({ type: 'SALIDA', amount: 20, reason: 'GASTO' }),
      { type: 'SALIDA', reason: 'GASTO', amount: 20, delta: -20 },
    )
    assert.throws(
      () =>
        normalizeCashMovement({ type: 'ENTRADA', amount: 20, reason: 'GASTO' }),
      (err) => err instanceof CashError && err.status === 422,
    )
  })

  it('PRESTAMO ENTRADA/SALIDA con nota; sin nota o AJUSTE → 422', () => {
    assert.deepEqual(
      normalizeCashMovement({
        type: 'SALIDA',
        amount: 50,
        reason: 'PRESTAMO',
        note: 'Juan',
      }),
      { type: 'SALIDA', reason: 'PRESTAMO', amount: 50, delta: -50 },
    )
    assert.deepEqual(
      normalizeCashMovement({
        type: 'ENTRADA',
        amount: 20,
        reason: 'PRESTAMO',
        note: 'Juan',
      }),
      { type: 'ENTRADA', reason: 'PRESTAMO', amount: 20, delta: 20 },
    )
    assert.throws(
      () =>
        normalizeCashMovement({
          type: 'SALIDA',
          amount: 50,
          reason: 'PRESTAMO',
        }),
      (err) => err instanceof CashError && err.status === 422,
    )
    assert.throws(
      () =>
        normalizeCashMovement({
          type: 'AJUSTE',
          delta: -5,
          reason: 'PRESTAMO',
          note: 'Juan',
        }),
      (err) => err instanceof CashError && err.status === 422,
    )
  })
})

describe('nextBalance', () => {
  it('ENTRADA suma al saldo', () => {
    const { delta } = normalizeCashMovement({ type: 'ENTRADA', amount: 100 })
    assert.equal(nextBalance(50, delta), 150)
  })

  it('SALIDA resta del saldo', () => {
    const { delta } = normalizeCashMovement({ type: 'SALIDA', amount: 40 })
    assert.equal(nextBalance(100, delta), 60)
  })

  it('SALIDA de más deja saldo negativo', () => {
    const { delta } = normalizeCashMovement({ type: 'SALIDA', amount: 10 })
    assert.equal(nextBalance(5, delta), -5)
  })

  it('AJUSTE negativo deja saldo negativo', () => {
    const { delta } = normalizeCashMovement({ type: 'AJUSTE', delta: -20 })
    assert.equal(nextBalance(5, delta), -15)
  })
})

describe('pickDefaultAccount', () => {
  const banesco = { id: 'bs', currency: 'BS', active: true }
  const binance = { id: 'usd', currency: 'USD', active: true }
  const extraBs = { id: 'bs2', currency: 'BS', active: true }
  const inactive = { id: 'old', currency: 'BS', active: false }

  it('una sola activa de esa moneda → esa cuenta', () => {
    assert.equal(pickDefaultAccount([banesco, binance], 'BS'), banesco)
    assert.equal(pickDefaultAccount([banesco, binance], 'USD'), binance)
  })

  it('cero o dos+ activas → null', () => {
    assert.equal(pickDefaultAccount([], 'BS'), null)
    assert.equal(pickDefaultAccount([binance], 'BS'), null)
    assert.equal(pickDefaultAccount([banesco, extraBs], 'BS'), null)
    assert.equal(pickDefaultAccount([inactive, binance], 'BS'), null)
  })
})

describe('assertAccountForPayment', () => {
  it('pago BS no puede ir a cuenta USD', () => {
    assert.throws(
      () => assertAccountForPayment({ active: true, currency: 'USD' }, 'BS'),
      (err) => err instanceof CashError && err.status === 422,
    )
  })

  it('cuenta inactiva o ausente → 422', () => {
    assert.throws(
      () => assertAccountForPayment(null, 'BS'),
      (err) => err instanceof CashError && err.status === 422,
    )
    assert.throws(
      () => assertAccountForPayment({ active: false, currency: 'BS' }, 'BS'),
      (err) => err instanceof CashError && err.status === 422,
    )
  })

  it('moneda coincidente y activa pasa', () => {
    assert.doesNotThrow(() =>
      assertAccountForPayment({ active: true, currency: 'BS' }, 'BS'),
    )
  })
})

describe('assertAccountsForConversion', () => {
  it('from debe ser BS y to USD', () => {
    const bs = { active: true, currency: 'BS' }
    const usd = { active: true, currency: 'USD' }
    assert.doesNotThrow(() => assertAccountsForConversion(bs, usd))
    assert.throws(
      () => assertAccountsForConversion(usd, bs),
      (err) => err instanceof CashError && err.status === 422,
    )
  })
})

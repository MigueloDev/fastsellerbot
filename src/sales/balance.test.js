import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { round2, balanceUsdOf, isSettled, PAYMENT_TOLERANCE } from './balance.js'

describe('balance', () => {
  it('round2 rounds to cents', () => {
    assert.equal(round2(13.695), 13.7)
    assert.equal(round2(13.694), 13.69)
  })

  it('balanceUsdOf = total − Σ payments', () => {
    const sale = {
      totalUsd: 20,
      payments: [{ amountUsd: 10 }, { amountUsd: '3.50' }],
    }
    assert.equal(balanceUsdOf(sale), 6.5)
  })

  it('exact USD payment settles', () => {
    const sale = { totalUsd: 20, payments: [{ amountUsd: 20 }] }
    assert.equal(balanceUsdOf(sale), 0)
    assert.equal(isSettled(0), true)
  })

  it('residual under tolerance settles; over does not', () => {
    assert.equal(isSettled(0.05), true)
    assert.equal(isSettled(PAYMENT_TOLERANCE), true)
    assert.equal(isSettled(PAYMENT_TOLERANCE + 0.01), false)
  })

  it('overpayment leaves negative balance beyond tolerance', () => {
    const bal = balanceUsdOf({ totalUsd: 20, payments: [{ amountUsd: 20.5 }] })
    assert.ok(bal < -PAYMENT_TOLERANCE)
    assert.equal(isSettled(bal), false)
  })

  it('Bs conversion residual example stays under tolerance when close', () => {
    // 20 USD − round2(500/36.52) = 20 − 13.69 = 6.31 remaining
    const amountUsd = round2(500 / 36.52)
    assert.equal(amountUsd, 13.69)
    const bal = balanceUsdOf({
      totalUsd: 20,
      payments: [{ amountUsd }, { amountUsd: 6.25 }],
    })
    assert.equal(bal, 0.06)
    assert.equal(isSettled(bal), true)
  })
})

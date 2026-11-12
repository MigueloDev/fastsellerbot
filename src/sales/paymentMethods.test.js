import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  PAYMENT_METHODS,
  currencyFor,
  matchesPriceRef,
  summarizeByMethod,
} from './paymentMethods.js'

describe('paymentMethods', () => {
  it('maps USD methods to REF_USD', () => {
    for (const m of ['EFECTIVO_USD', 'ZELLE', 'USDT']) {
      assert.equal(PAYMENT_METHODS[m].currency, 'USD')
      assert.equal(PAYMENT_METHODS[m].priceRef, 'REF_USD')
      assert.equal(currencyFor(m), 'USD')
      assert.equal(matchesPriceRef(m, 'REF_USD'), true)
      assert.equal(matchesPriceRef(m, 'REF_BS'), false)
    }
  })

  it('maps BS methods to REF_BS', () => {
    for (const m of ['PAGO_MOVIL', 'TRANSFERENCIA', 'PUNTO', 'EFECTIVO_BS']) {
      assert.equal(PAYMENT_METHODS[m].currency, 'BS')
      assert.equal(PAYMENT_METHODS[m].priceRef, 'REF_BS')
      assert.equal(currencyFor(m), 'BS')
      assert.equal(matchesPriceRef(m, 'REF_BS'), true)
      assert.equal(matchesPriceRef(m, 'REF_USD'), false)
    }
  })

  it('throws on unknown method', () => {
    assert.throws(() => currencyFor('CHEQUE'), /inválido/)
  })

  it('summarizeByMethod groups by method in canonical order', () => {
    const rows = summarizeByMethod([
      { method: 'PAGO_MOVIL', currency: 'BS', amount: 1000.1, amountUsd: 10.01 },
      { method: 'ZELLE', currency: 'USD', amount: 20, amountUsd: 20 },
      { method: 'PAGO_MOVIL', currency: 'BS', amount: 500.2, amountUsd: 5.02 },
    ])
    assert.deepEqual(rows, [
      { method: 'ZELLE', currency: 'USD', count: 1, amount: 20, amountUsd: 20 },
      { method: 'PAGO_MOVIL', currency: 'BS', count: 2, amount: 1500.3, amountUsd: 15.03 },
    ])
    assert.deepEqual(summarizeByMethod([]), [])
  })
})

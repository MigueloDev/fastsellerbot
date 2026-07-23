import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  saleProfitOf,
  currencyPurchaseProfitOf,
  expectedUsdt,
  paymentCurrencyTotals,
} from './profit.js'

describe('saleProfitOf', () => {
  it('calcula costo, ganancia y margen', () => {
    const r = saleProfitOf({
      totalUsd: 100,
      items: [
        { quantity: 2, unitCostUsd: 20 },
        { quantity: 1, unitCostUsd: 10 },
      ],
    })
    assert.deepEqual(r, { costUsd: 50, profitUsd: 50, marginPct: 50 })
  })

  it('retorna null si falta unitCostUsd en algún ítem', () => {
    const r = saleProfitOf({
      totalUsd: 100,
      items: [
        { quantity: 1, unitCostUsd: 10 },
        { quantity: 1, unitCostUsd: null },
      ],
    })
    assert.deepEqual(r, { costUsd: null, profitUsd: null, marginPct: null })
  })

  it('retorna null sin ítems', () => {
    assert.deepEqual(saleProfitOf({ totalUsd: 0, items: [] }), {
      costUsd: null,
      profitUsd: null,
      marginPct: null,
    })
  })

  it('redondea a 2 decimales', () => {
    const r = saleProfitOf({
      totalUsd: 10,
      items: [{ quantity: 3, unitCostUsd: 1.111 }],
    })
    assert.equal(r.costUsd, 3.33)
    assert.equal(r.profitUsd, 6.67)
  })
})

describe('currencyPurchaseProfitOf', () => {
  it('USDT + USD − costo', () => {
    assert.deepEqual(
      currencyPurchaseProfitOf({ usdtReceived: 80, usdCollected: 20, costUsd: 70 }),
      { profitUsd: 30 },
    )
  })

  it('null si no hay costo', () => {
    assert.deepEqual(
      currencyPurchaseProfitOf({ usdtReceived: 80, usdCollected: 0, costUsd: null }),
      { profitUsd: null },
    )
  })
})

describe('expectedUsdt', () => {
  it('Bs / tasa Binance', () => {
    assert.equal(expectedUsdt(36000, 360), 100)
  })

  it('null con tasa inválida', () => {
    assert.equal(expectedUsdt(100, 0), null)
  })
})

describe('paymentCurrencyTotals', () => {
  it('separa BS y USD', () => {
    const r = paymentCurrencyTotals([
      { currency: 'BS', amount: 1000, amountUsd: 2.5 },
      { currency: 'BS', amount: 500, amountUsd: 1.25 },
      { currency: 'USD', amount: 10, amountUsd: 10 },
    ])
    assert.deepEqual(r, { bsSpent: 1500, usdCollected: 10 })
  })
})

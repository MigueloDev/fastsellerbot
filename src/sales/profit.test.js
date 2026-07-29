import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  saleProfitOf,
  currencyPurchaseProfitOf,
  expectedUsdt,
  paymentCurrencyTotals,
  fxAvailability,
  allocateUsdt,
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

describe('fxAvailability', () => {
  it('resta Bs/USD ya convertidos; elegible ssi bsAvailable > 0', () => {
    const payments = [
      { currency: 'BS', amount: 1000, amountUsd: 2.5 },
      { currency: 'BS', amount: 500, amountUsd: 1.25 },
      { currency: 'USD', amount: 10, amountUsd: 10 },
    ]
    const purchases = [{ bsSpent: 1000, usdCollected: 0, usdtReceived: 2.7 }]
    const fx = fxAvailability(payments, purchases)
    assert.equal(fx.totalBs, 1500)
    assert.equal(fx.bsConverted, 1000)
    assert.equal(fx.bsAvailable, 500)
    assert.equal(fx.usdAvailable, 10)
    assert.equal(fx.usdtReceived, 2.7)
    assert.ok(fx.bsAvailable > 0)
  })

  it('bsAvailable 0 tras convertir todo', () => {
    const fx = fxAvailability(
      [{ currency: 'BS', amount: 1000, amountUsd: 2.5 }],
      [{ bsSpent: 1000, usdCollected: 0, usdtReceived: 2.5 }],
    )
    assert.equal(fx.bsAvailable, 0)
  })

  it('acepta allocations con la misma forma que purchases', () => {
    const fx = fxAvailability(
      [{ currency: 'BS', amount: 2000, amountUsd: 5 }],
      [{ bsSpent: 500, usdCollected: 0, usdtReceived: 1.2 }],
    )
    assert.equal(fx.bsAvailable, 1500)
    assert.equal(fx.usdtReceived, 1.2)
  })
})

describe('allocateUsdt', () => {
  it('reparte proporcional a Bs; suma = total', () => {
    const shares = allocateUsdt([1000, 3000], 40)
    assert.equal(shares[0], 10)
    assert.equal(shares[1], 30)
    assert.equal(shares.reduce((a, b) => a + b, 0), 40)
  })

  it('última fila absorbe residuo de redondeo', () => {
    const shares = allocateUsdt([1, 1, 1], 1)
    assert.equal(shares.length, 3)
    const sum = Math.round(shares.reduce((a, b) => a + b, 0) * 1e6) / 1e6
    assert.equal(sum, 1)
    assert.equal(shares[0], shares[1])
  })

  it('una sola venta recibe todo', () => {
    assert.deepEqual(allocateUsdt([5000], 12.5), [12.5])
  })
})

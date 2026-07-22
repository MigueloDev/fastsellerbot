import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pickTierPrice, qtyByProduct } from './pricing.js'

const tiers = [
  { ref: 'REF_USD', minQty: 1, amount: 28.19, active: true },
  { ref: 'REF_USD', minQty: 6, amount: 26.85, active: true },
  { ref: 'REF_USD', minQty: 10, amount: 25.06, active: true },
  { ref: 'REF_BS', minQty: 1, amount: 35.24, active: true },
  { ref: 'REF_BS', minQty: 6, amount: 33.56, active: true },
  { ref: 'REF_BS', minQty: 10, amount: 31.33, active: true },
]

describe('pickTierPrice', () => {
  it('elige el nivel base para qty 1–5', () => {
    assert.equal(pickTierPrice(tiers, 'REF_USD', 1), 28.19)
    assert.equal(pickTierPrice(tiers, 'REF_USD', 5), 28.19)
    assert.equal(pickTierPrice(tiers, 'REF_BS', 5), 35.24)
  })

  it('elige el nivel medio en el límite exacto 6–9', () => {
    assert.equal(pickTierPrice(tiers, 'REF_USD', 6), 26.85)
    assert.equal(pickTierPrice(tiers, 'REF_USD', 9), 26.85)
  })

  it('elige el nivel alto desde 10+', () => {
    assert.equal(pickTierPrice(tiers, 'REF_USD', 10), 25.06)
    assert.equal(pickTierPrice(tiers, 'REF_BS', 100), 31.33)
  })

  it('ignora precios inactivos y de otro ref', () => {
    const mixed = [
      ...tiers,
      { ref: 'REF_USD', minQty: 10, amount: 1, active: false },
    ]
    assert.equal(pickTierPrice(mixed, 'REF_USD', 10), 25.06)
    assert.equal(pickTierPrice(mixed, 'REF_BS', 10), 31.33)
  })

  it('retorna null sin candidatos aplicables', () => {
    assert.equal(pickTierPrice([], 'REF_USD', 1), null)
    assert.equal(pickTierPrice(tiers, 'REF_USD', 0), null)
    assert.equal(
      pickTierPrice([{ ref: 'REF_USD', minQty: 5, amount: 10, active: true }], 'REF_USD', 3),
      null,
    )
  })
})

describe('qtyByProduct', () => {
  it('suma líneas y variantes del mismo producto', () => {
    const map = qtyByProduct([
      { productId: 'p1', quantity: 3 },
      { productId: 'p1', quantity: 4 },
      { productId: 'p2', quantity: 2 },
    ])
    assert.equal(map.get('p1'), 7)
    assert.equal(map.get('p2'), 2)
  })

  it('ignora items sin productId', () => {
    const map = qtyByProduct([{ productId: '', quantity: 5 }, { quantity: 2 }])
    assert.equal(map.size, 0)
  })
})

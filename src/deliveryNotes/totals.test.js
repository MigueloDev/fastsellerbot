import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { totalUsdOf, visibleMoneyFields } from './totals.js'

describe('totalUsdOf', () => {
  it('suma subtotales redondeando a 2', () => {
    assert.equal(
      totalUsdOf([{ subtotalUsd: 10.125 }, { subtotalUsd: 2.5 }]),
      12.63,
    )
  })

  it('vacío → 0', () => {
    assert.equal(totalUsdOf([]), 0)
  })
})

describe('visibleMoneyFields', () => {
  const amounts = { unitPriceUsd: 5, subtotalUsd: 10, totalUsd: 10 }

  it('showValue true expone montos', () => {
    assert.deepEqual(visibleMoneyFields(true, amounts), amounts)
  })

  it('showValue false oculta montos', () => {
    assert.deepEqual(visibleMoneyFields(false, amounts), {
      unitPriceUsd: null,
      subtotalUsd: null,
      totalUsd: null,
    })
  })
})

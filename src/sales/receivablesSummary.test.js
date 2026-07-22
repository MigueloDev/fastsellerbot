import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeReceivables } from './receivablesSummary.js'

describe('summarizeReceivables', () => {
  it('sums balances and groups by customer', () => {
    const bsRate = { rate: 36.5, fetchedAt: '2026-07-01T00:00:00.000Z' }
    const result = summarizeReceivables([
      {
        customerId: 'c1',
        customer: { id: 'c1', name: 'Ana' },
        createdAt: '2026-06-01T00:00:00.000Z',
        balanceUsd: 10,
        balanceBs: 365,
        bsRate,
      },
      {
        customerId: 'c1',
        customer: { id: 'c1', name: 'Ana' },
        createdAt: '2026-07-01T00:00:00.000Z',
        balanceUsd: 5.5,
        balanceBs: 200.75,
        bsRate,
      },
      {
        customerId: 'c2',
        customer: { id: 'c2', name: 'Bob' },
        createdAt: '2026-05-01T00:00:00.000Z',
        balanceUsd: 20,
        balanceBs: null,
        bsRate: null,
      },
    ])

    assert.equal(result.totalOwedUsd, 35.5)
    assert.equal(result.totalOwedBs, 565.75)
    assert.deepEqual(result.bsRate, bsRate)
    assert.equal(result.customers.length, 2)
    assert.equal(result.customers[0].customer.id, 'c2')
    assert.equal(result.customers[0].totalOwedUsd, 20)
    assert.equal(result.customers[1].totalOwedUsd, 15.5)
  })

  it('returns zeros when empty', () => {
    const result = summarizeReceivables([])
    assert.equal(result.totalOwedUsd, 0)
    assert.equal(result.totalOwedBs, null)
    assert.equal(result.bsRate, null)
    assert.deepEqual(result.customers, [])
  })
})

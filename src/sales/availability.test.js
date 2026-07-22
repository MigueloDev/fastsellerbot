import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { levelKey, availableQty, checkAvailability } from './availability.js'

describe('availability', () => {
  it('levelKey distingue producto sin variante de producto con variante', () => {
    assert.equal(levelKey('p1', null), 'p1|')
    assert.equal(levelKey('p1', undefined), 'p1|')
    assert.equal(levelKey('p1', 'v1'), 'p1|v1')
    assert.notEqual(levelKey('p1', null), levelKey('p1', 'v1'))
  })

  it('availableQty = físico − comprometido', () => {
    assert.equal(availableQty(10, 3), 7)
    assert.equal(availableQty(10), 10)
    assert.equal(availableQty(0, 0), 0)
  })

  it('stock suficiente pasa', () => {
    assert.deepEqual(checkAvailability({ onHand: 10, committed: 3, requested: 5 }), {
      ok: true,
      available: 7,
    })
  })

  it('stock exacto pasa', () => {
    assert.deepEqual(checkAvailability({ onHand: 10, committed: 3, requested: 7 }), {
      ok: true,
      available: 7,
    })
  })

  it('stock insuficiente falla y reporta lo disponible', () => {
    assert.deepEqual(checkAvailability({ onHand: 10, committed: 8, requested: 5 }), {
      ok: false,
      available: 2,
    })
  })

  it('sin nivel de stock (0 físico) falla', () => {
    assert.deepEqual(checkAvailability({ onHand: 0, committed: 0, requested: 1 }), {
      ok: false,
      available: 0,
    })
  })

  it('editar venta: excluir lo comprometido por la propia venta libera unidades', () => {
    // Venta actual compromete 4 de 10; al editar, el committed pasado excluye esas 4.
    const committedIncludingSelf = 4
    const committedExcludingSelf = 0
    assert.equal(
      checkAvailability({ onHand: 10, committed: committedIncludingSelf, requested: 8 }).ok,
      false,
    )
    assert.equal(
      checkAvailability({ onHand: 10, committed: committedExcludingSelf, requested: 8 }).ok,
      true,
    )
  })
})

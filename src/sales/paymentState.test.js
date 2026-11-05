import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { paymentStateOf, paymentStatesWhere } from './paymentState.js'

describe('paymentStateOf', () => {
  it('PAGADA sin importar pagos', () => {
    assert.equal(paymentStateOf({ status: 'PAGADA' }), 'PAGADA')
  })

  it('PENDIENTE con pagos es ABONADA', () => {
    assert.equal(paymentStateOf({ status: 'PENDIENTE', paymentsCount: 2 }), 'ABONADA')
  })

  it('PENDIENTE sin pagos es CREDITO', () => {
    assert.equal(paymentStateOf({ status: 'PENDIENTE', paymentsCount: 0 }), 'CREDITO')
  })

  it('ANULADA no tiene estado de cobro', () => {
    assert.equal(paymentStateOf({ status: 'ANULADA' }), null)
  })
})

describe('paymentStatesWhere', () => {
  it('sin filtro devuelve undefined', () => {
    assert.equal(paymentStatesWhere(undefined), undefined)
    assert.equal(paymentStatesWhere(''), undefined)
  })

  it('valores inválidos se ignoran; si todos lo son, undefined', () => {
    assert.equal(paymentStatesWhere('FOO,BAR'), undefined)
  })

  it('CSV mixto traduce cada estado a su condición', () => {
    assert.deepEqual(paymentStatesWhere('PAGADA,ABONADA,CREDITO,ANULADA'), [
      { status: 'PAGADA' },
      { status: 'PENDIENTE', payments: { some: {} } },
      { status: 'PENDIENTE', payments: { none: {} } },
      { status: 'ANULADA' },
    ])
  })

  it('PENDIENTE solo (retrocompatible con el link del home)', () => {
    assert.deepEqual(paymentStatesWhere('PENDIENTE'), [{ status: 'PENDIENTE' }])
  })

  it('ignora valores inválidos mezclados con válidos', () => {
    assert.deepEqual(paymentStatesWhere('PAGADA,FOO'), [{ status: 'PAGADA' }])
  })
})

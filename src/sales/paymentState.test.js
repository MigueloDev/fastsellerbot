import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { paymentStateOf } from './paymentState.js'

describe('paymentStateOf', () => {
  it('PAGADA cuando status es PAGADA', () => {
    assert.equal(paymentStateOf({ status: 'PAGADA', paymentsCount: 2 }), 'PAGADA')
    assert.equal(paymentStateOf({ status: 'PAGADA', paymentsCount: 0 }), 'PAGADA')
  })

  it('ABONADA cuando PENDIENTE con pagos', () => {
    assert.equal(paymentStateOf({ status: 'PENDIENTE', paymentsCount: 1 }), 'ABONADA')
    assert.equal(paymentStateOf({ status: 'PENDIENTE', paymentsCount: 3 }), 'ABONADA')
  })

  it('CREDITO cuando PENDIENTE sin pagos', () => {
    assert.equal(paymentStateOf({ status: 'PENDIENTE', paymentsCount: 0 }), 'CREDITO')
    assert.equal(paymentStateOf({ status: 'PENDIENTE' }), 'CREDITO')
  })

  it('null cuando ANULADA u otro status', () => {
    assert.equal(paymentStateOf({ status: 'ANULADA', paymentsCount: 0 }), null)
    assert.equal(paymentStateOf({ status: 'ANULADA', paymentsCount: 1 }), null)
    assert.equal(paymentStateOf({ status: 'OTRO', paymentsCount: 0 }), null)
  })
})

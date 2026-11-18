import { it } from 'node:test'
import assert from 'node:assert/strict'
import { layawayContractModel } from './layawayContractModel.js'

const START = '2026-11-02T16:00:00Z'
const sale = {
  totalUsd: 125,
  customer: { name: 'Ana Pérez', cedula: 'V-12345678', phone: '0414', address: 'Punto Fijo' },
  items: [{ quantity: 1, product: { name: 'Ventilador solar SACO' }, variant: { name: 'X-16' } }],
  payments: [{ amountUsd: 49, amount: 49, currency: 'USD', method: 'EFECTIVO_USD', paidAt: START, note: null }],
  layaway: { number: 7, startAt: START, downPaymentUsd: 49, installments: 4, everyDays: 7, deadlineDays: 30, penaltyPct: 20, serial: null },
}

it('interpola el contrato base', () => {
  const m = layawayContractModel(sale, new Date(START))
  const text = m.clauses.map((c) => c[1]).join(' ')
  assert.equal(m.number, '00007')
  assert.match(text, /CIENTO VEINTICINCO DÓLARES DE LOS ESTADOS UNIDOS DE AMÉRICA \(USD 125,00\)/)
  assert.match(text, /inicial de USD 49,00/)
  assert.match(text, /cuatro \(4\) cuotas semanales de USD 19,00 cada una/)
  assert.match(text, /treinta \(30\) días continuos/)
  assert.match(text, /20 % del monto de la inicial, es decir, USD 9,80/)
  assert.equal(m.customer[4][1], 'Ventilador solar SACO, modelo: X-16')
  assert.match(m.closing, /a los 2 días del mes de noviembre de 2026/)
  assert.deepEqual(m.scheduleRows.map((r) => r[2]), ['49,00', '19,00', '19,00', '19,00', '19,00', '125,00'])
  assert.equal(m.scheduleRows[1][1], 'Día 7  09/11/2026')
  assert.equal(m.scheduleRows[5][4], 'Resta: USD 76,00')
})

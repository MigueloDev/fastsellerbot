import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCedula, normalizePhone, displayName } from './validate.js'

describe('normalizeCedula', () => {
  it('accepts V/E + digits and strips dashes', () => {
    assert.equal(normalizeCedula('v-12.345.678'), 'V12345678')
    assert.equal(normalizeCedula('E1234567'), 'E1234567')
  })

  it('accepts digits-only', () => {
    assert.equal(normalizeCedula('12345678'), '12345678')
  })

  it('rejects garbage', () => {
    assert.equal(normalizeCedula(''), null)
    assert.equal(normalizeCedula('J123'), null)
    assert.equal(normalizeCedula('V12'), null)
  })
})

describe('normalizePhone', () => {
  it('accepts valid VE mobile', () => {
    assert.deepEqual(normalizePhone('04141234567'), {
      ok: true,
      value: '04141234567',
    })
    assert.deepEqual(normalizePhone('0426-765-4321'), {
      ok: true,
      value: '04267654321',
    })
  })

  it('allows empty', () => {
    assert.deepEqual(normalizePhone(null), { ok: true, value: null })
    assert.deepEqual(normalizePhone('  '), { ok: true, value: null })
  })

  it('rejects wrong length or prefix', () => {
    assert.equal(normalizePhone('0414123456').ok, false)
    assert.equal(normalizePhone('041412345678').ok, false)
    assert.equal(normalizePhone('02121234567').ok, false)
  })
})

describe('displayName', () => {
  it('joins first + last', () => {
    assert.equal(displayName('Ana', 'Pérez'), 'Ana Pérez')
  })
})

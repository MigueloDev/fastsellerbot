import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retry } from './retry.js'

test('retry devuelve en cuanto fn tiene éxito', async () => {
  let calls = 0
  const out = await retry(async () => {
    if (++calls < 3) throw new Error('fail')
    return 'ok'
  }, { delay: 1 })
  assert.equal(out, 'ok')
  assert.equal(calls, 3)
})

test('retry propaga el último error tras agotar intentos', async () => {
  let calls = 0
  await assert.rejects(
    retry(async () => { throw new Error(`fail ${++calls}`) }, { attempts: 2, delay: 1 }),
    /fail 2/,
  )
  assert.equal(calls, 2)
})

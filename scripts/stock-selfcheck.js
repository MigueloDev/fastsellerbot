/**
 * ponytail: pure unit check of normalize/guard logic without DB.
 * Run: node --input-type=module -e "$(sed -n '1,120p' scripts/stock-selfcheck.js)" 
 * or: node scripts/stock-selfcheck.js
 */
import assert from 'node:assert/strict'

// Mirror of normalize rules from src/db/stock.js (keep in sync if rules change)
function normalizeItem(item) {
  const { type } = item
  let quantity
  let delta
  if (type === 'AJUSTE') {
    assert.ok(item.delta != null && item.delta !== 0)
    assert.ok(item.note?.trim())
    delta = item.delta
    quantity = Math.abs(delta)
  } else {
    assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1)
    quantity = item.quantity
    delta = type === 'ENTRADA' ? quantity : -quantity
  }
  return { quantity, delta }
}

function apply(current, delta) {
  const next = current + delta
  if (next < 0) throw new Error('negative')
  return next
}

let qty = 0
qty = apply(qty, normalizeItem({ type: 'ENTRADA', quantity: 5 }).delta)
assert.equal(qty, 5)
qty = apply(qty, normalizeItem({ type: 'SALIDA', quantity: 5 }).delta)
assert.equal(qty, 0)
assert.throws(() => apply(qty, normalizeItem({ type: 'SALIDA', quantity: 1 }).delta))
qty = apply(qty, normalizeItem({ type: 'AJUSTE', delta: 3, note: 'conteo' }).delta)
assert.equal(qty, 3)
qty = apply(qty, normalizeItem({ type: 'AJUSTE', delta: -1, note: 'merma' }).delta)
assert.equal(qty, 2)

console.log('stock-selfcheck ok')

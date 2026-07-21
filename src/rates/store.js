import { redisConnection } from '../queue/client.js'
import { getLatestRate, insertRate } from '../db/rates.js'

const REDIS_KEYS = {
  BCV: 'rate:bcv',
  BINANCE: 'rate:binance',
}

function redisKey(source) {
  return REDIS_KEYS[source]
}

/**
 * Persist to Postgres + hot Redis cache (no TTL).
 * @param {'BCV'|'BINANCE'} source
 * @param {number} rate
 * @param {Date} fetchedAt
 */
export async function storeRate(source, rate, fetchedAt = new Date()) {
  const saved = await insertRate(source, rate, fetchedAt)
  const key = redisKey(source)
  if (key) {
    await redisConnection.set(key, JSON.stringify(saved))
  }
  return saved
}

/**
 * Redis first, then latest Postgres row.
 * @param {'BCV'|'BINANCE'} source
 * @returns {Promise<{ rate: number, fetchedAt: string }|null>}
 */
export async function readRate(source) {
  const key = redisKey(source)
  if (key) {
    const raw = await redisConnection.get(key)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Number.isFinite(parsed?.rate) && parsed?.fetchedAt) {
          return { rate: Number(parsed.rate), fetchedAt: String(parsed.fetchedAt) }
        }
      } catch {
        // fall through to PG
      }
    }
  }
  return getLatestRate(source)
}

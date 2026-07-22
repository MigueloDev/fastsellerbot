import { parseInterval } from './parseInterval.js'

/** Min age between persisted rates per source (= worker schedule). */
export const RATE_INTERVALS_MS = {
  BCV: parseInterval(process.env.RATE_BCV_INTERVAL, 4 * 60 * 60 * 1000),
  BINANCE: parseInterval(process.env.RATE_BINANCE_INTERVAL, 10 * 60 * 1000),
}

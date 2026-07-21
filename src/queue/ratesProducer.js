import { Queue } from 'bullmq'
import { redisConnection } from './client.js'
import { parseInterval } from '../rates/parseInterval.js'

const BCV_EVERY_MS = parseInterval(process.env.RATE_BCV_INTERVAL, 4 * 60 * 60 * 1000)
const BINANCE_EVERY_MS = parseInterval(process.env.RATE_BINANCE_INTERVAL, 10 * 60 * 1000)

export const ratesQueue = new Queue('exchange-rates', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

/** Register repeatable schedulers + immediate boot fetches. */
export async function setupRatesJobs() {
  // BullMQ rejects custom ids that contain ':'
  await ratesQueue.upsertJobScheduler(
    'repeat-bcv',
    { every: BCV_EVERY_MS },
    { name: 'fetch-bcv' },
  )
  await ratesQueue.upsertJobScheduler(
    'repeat-binance',
    { every: BINANCE_EVERY_MS },
    { name: 'fetch-binance' },
  )

  // Fixed jobIds so a rapid restart does not stack cold-start fetches.
  for (const [name, id] of [
    ['fetch-bcv', 'boot-bcv'],
    ['fetch-binance', 'boot-binance'],
  ]) {
    const existing = await ratesQueue.getJob(id)
    if (existing) await existing.remove().catch(() => {})
    await ratesQueue.add(name, {}, { jobId: id })
  }

  console.log('💱 Rates schedulers:', {
    bcvEveryMs: BCV_EVERY_MS,
    binanceEveryMs: BINANCE_EVERY_MS,
  })
}

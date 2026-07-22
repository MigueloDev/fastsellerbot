import { Queue } from 'bullmq'
import { redisConnection } from './client.js'
import { RATE_INTERVALS_MS } from '../rates/intervals.js'

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
    { every: RATE_INTERVALS_MS.BCV },
    { name: 'fetch-bcv' },
  )
  await ratesQueue.upsertJobScheduler(
    'repeat-binance',
    { every: RATE_INTERVALS_MS.BINANCE },
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
    bcvEveryMs: RATE_INTERVALS_MS.BCV,
    binanceEveryMs: RATE_INTERVALS_MS.BINANCE,
  })
}

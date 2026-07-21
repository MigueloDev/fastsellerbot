import { Worker } from 'bullmq'
import { redisConnection } from './client.js'
import { processRateFetch } from '../rates/process.js'

export function createRatesWorker() {
  const worker = new Worker(
    'exchange-rates',
    async (job) => {
      if (job.name === 'fetch-bcv') {
        return processRateFetch('BCV')
      }
      if (job.name === 'fetch-binance') {
        return processRateFetch('BINANCE')
      }
      console.warn('💱 Unknown rates job:', job.name)
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  )

  worker.on('failed', (job, err) => {
    console.error('❌ Rates job failed:', job?.name, job?.id, err.message)
  })
  worker.on('error', (err) => console.error('❌ Rates worker error:', err.message))

  return worker
}

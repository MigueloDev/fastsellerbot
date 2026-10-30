import { retry } from '../lib/retry.js'
import { processRateFetch } from './process.js'
import { RATE_INTERVALS_MS } from './intervals.js'

// ponytail: setInterval en vez de BullMQ (Upstash free cobra por comando); un solo proceso.
export function startRatesSchedule() {
  for (const source of ['BCV', 'BINANCE']) {
    const run = () =>
      retry(() => processRateFetch(source)).catch(err =>
        console.error(`❌ Rate ${source} fetch failed:`, err.message),
      )
    run()
    setInterval(run, RATE_INTERVALS_MS[source])
  }
  console.log('💱 Rates schedule:', {
    bcvEveryMs: RATE_INTERVALS_MS.BCV,
    binanceEveryMs: RATE_INTERVALS_MS.BINANCE,
  })
}

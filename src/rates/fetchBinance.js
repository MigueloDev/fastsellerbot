/**
 * Port of dashboard /api/binance — first BUY USDT/VES advert.
 * @returns {Promise<{ rate: number, fetchedAt: Date }>}
 */
export async function fetchBinance() {
  const res = await fetch(
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fiat: 'VES',
        asset: 'USDT',
        tradeType: 'BUY',
        page: 1,
        rows: 1,
      }),
    },
  )

  if (!res.ok) throw new Error(`Binance upstream ${res.status}`)

  const json = await res.json()
  const price = json?.data?.[0]?.adv?.price
  if (!price) throw new Error('Binance price not found in response')

  const rate = parseFloat(price)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Binance rate invalid')
  }

  return { rate, fetchedAt: new Date() }
}

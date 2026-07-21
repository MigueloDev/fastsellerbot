/**
 * Port of dashboard /api/bcv — no credential logging.
 * @returns {Promise<{ rate: number, fetchedAt: Date }>}
 */
export async function fetchBcv() {
  const baseUrl = process.env.BCV_API_URL
  const apiKey = process.env.BCV_API_KEY
  const deviceId = process.env.BCV_DEVICE_ID

  if (!baseUrl || !apiKey || !deviceId) {
    throw new Error('Missing BCV upstream configuration')
  }

  const res = await fetch(`${baseUrl}/rate`, {
    headers: {
      'x-device-id': deviceId,
      'x-api-key': apiKey,
    },
  })
  if (!res.ok) throw new Error(`BCV upstream ${res.status}`)

  const { current } = await res.json()
  const rate = Number(current?.usd)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('BCV rate missing or invalid')
  }

  const fetchedAt = current?.date ? new Date(current.date) : new Date()
  return {
    rate,
    fetchedAt: Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt,
  }
}

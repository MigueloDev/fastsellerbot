export function createHealthHandler(sockBaileys) {
  return async function health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      bot: sockBaileys?.user ? 'connected' : 'disconnected',
    }
  }
}

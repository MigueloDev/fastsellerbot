import IORedis from 'ioredis'

const redis = new IORedis({
  host: process.env.REDIS_HOST ?? '127.0.0.1',
  port: Number(process.env.REDIS_PORT ?? 6379),
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
})

const CONTEXT_PREFIX = 'context:'
const PAUSE_PREFIX = 'pause:'
const MAX_MESSAGES = 10
const CONTEXT_TTL = 60 * 60 * 2  // 2 horas
const PAUSE_TTL = 60 * 15         // 15 minutos

export async function getContext(jid) {
  const key = CONTEXT_PREFIX + jid
  const messages = await redis.lrange(key, 0, -1)
  return messages.map(m => JSON.parse(m))
}

export async function addToContext(jid, role, content) {
  const key = CONTEXT_PREFIX + jid
  const message = JSON.stringify({ role, content })
  await redis.rpush(key, message)
  await redis.ltrim(key, -MAX_MESSAGES, -1)
  await redis.expire(key, CONTEXT_TTL)
}

export async function clearContext(jid) {
  await redis.del(CONTEXT_PREFIX + jid)
}

export async function isPaused(jid) {
  const key = PAUSE_PREFIX + jid
  const val = await redis.get(key)
  return val !== null
}

export async function pauseConversation(jid) {
  const key = PAUSE_PREFIX + jid
  await redis.set(key, Date.now().toString(), 'EX', PAUSE_TTL)
  console.log(`⏸️  Conversación pausada 15min: ${jid}`)
}

export async function resumeConversation(jid) {
  await redis.del(PAUSE_PREFIX + jid)
  console.log(`▶️  Conversación reanudada: ${jid}`)
}

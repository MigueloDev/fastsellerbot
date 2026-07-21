import { useRedisAuthStateWithHSet } from 'baileys-redis-auth'
import makeWASocket, { Browsers, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'

const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, SESSION_ID } = process.env

// ponytail: mute Baileys pino without adding a pino dep
const silentLogger = {
  level: 'silent',
  child() {
    return this
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
}

export async function createConnection() {
  const redisOptions = {
    host: REDIS_HOST,
    port: Number(REDIS_PORT),
    ...(REDIS_PASSWORD && { password: REDIS_PASSWORD }),
  }
  const { state, saveCreds, redis } = await useRedisAuthStateWithHSet(
    redisOptions,
    SESSION_ID,
    /* console.log */
  )

  await redis.ping()

  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    logger: silentLogger,
  })

  sock.ev.on('creds.update', saveCreds)

  return { sock, redis }
}

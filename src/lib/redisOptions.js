export function redisOptions(env = process.env) {
  if (env.REDIS_URL) {
    const u = new URL(env.REDIS_URL)
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      ...(u.username && { username: decodeURIComponent(u.username) }),
      ...(u.password && { password: decodeURIComponent(u.password) }),
      ...(u.protocol === 'rediss:' && { tls: {} }), // Upstash exige TLS
    }
  }
  return {
    host: env.REDIS_HOST ?? '127.0.0.1',
    port: Number(env.REDIS_PORT ?? 6379),
    ...(env.REDIS_PASSWORD && { password: env.REDIS_PASSWORD }),
    ...(env.REDIS_TLS === 'true' && { tls: {} }), // Upstash exige TLS
  }
}

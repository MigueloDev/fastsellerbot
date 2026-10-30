const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/** Reintenta fn con backoff exponencial (reemplaza attempts/backoff de BullMQ). */
export async function retry(fn, { attempts = 3, delay = 2000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i >= attempts) throw err
      await sleep(delay * 2 ** (i - 1))
    }
  }
}

/**
 * Idempotencia genérica por `clientId` (UUID generado por la app móvil offline).
 * Puro en el sentido de que no asume Prisma: recibe `find`/`create` inyectados.
 *
 * Flujo:
 * - Sin clientId → crea siempre.
 * - Con clientId y `find` encuentra algo → replay (no se ejecuta `create`).
 * - Con clientId, `find` no encuentra nada → `create()`. Si choca con el unique
 *   (carrera entre dos requests con el mismo clientId), se reintenta `find` una
 *   vez: si ahora aparece, es replay; si no, se relanza el error original (era
 *   otro unique, p. ej. cédula).
 *
 * @template T
 * @param {string|null|undefined} clientId
 * @param {{ find: (clientId: string) => Promise<T|null>, create: () => Promise<T> }} ops
 * @returns {Promise<{ record: T, replayed: boolean }>}
 */
export async function findOrCreate(clientId, { find, create }) {
  if (!clientId) {
    return { record: await create(), replayed: false }
  }

  const existing = await find(clientId)
  if (existing) return { record: existing, replayed: true }

  try {
    return { record: await create(), replayed: false }
  } catch (err) {
    if (err?.code === 'P2002') {
      const retry = await find(clientId)
      if (retry) return { record: retry, replayed: true }
    }
    throw err
  }
}

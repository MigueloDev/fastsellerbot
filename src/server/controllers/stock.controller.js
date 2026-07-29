import {
  listStockLevels,
  getProductStock,
  listMovements,
  createMovements,
  StockError,
} from '../../db/stock.js'

export async function list(request, reply) {
  try {
    return await listStockLevels()
  } catch (err) {
    throw err
  }
}

export async function productStock(request, reply) {
  try {
    const movementsLimit = request.query.movementsLimit
    const detail = await getProductStock(request.params.id, {
      movementsLimit: movementsLimit != null ? Number(movementsLimit) : 20,
    })
    if (!detail) {
      reply.status(404).send({ error: 'Producto no encontrado' })
      return
    }
    return detail
  } catch (err) {
    throw err
  }
}

export async function createMovementBatch(request, reply) {
  try {
    const agentName = request.user?.name ?? 'Agente'
    const results = await createMovements(request.body.movements, { agentName })
    reply.status(201).send(results)
  } catch (err) {
    if (err instanceof StockError) {
      reply.status(err.status).send({ error: err.message })
      return
    }
    throw err
  }
}

export async function listMovementHistory(request, reply) {
  try {
    const { productId, variantId, type, from, to, limit, offset } = request.query
    return await listMovements({
      productId,
      variantId,
      type,
      from,
      to,
      limit: limit != null ? Number(limit) : 50,
      offset: offset != null ? Number(offset) : 0,
    })
  } catch (err) {
    throw err
  }
}

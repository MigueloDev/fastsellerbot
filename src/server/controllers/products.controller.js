import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
} from '../../db/products.js'

/** @returns {string|null} error message if invalid */
export function validatePriceUniques(prices) {
  if (!prices?.length) return null
  const seen = new Set()
  for (const p of prices) {
    if (p.active === false) continue
    const key = `${p.ref}:${p.minQty ?? 1}`
    if (seen.has(key)) {
      return `Precio duplicado para (${p.ref}, minQty=${p.minQty ?? 1})`
    }
    seen.add(key)
  }
  return null
}

export async function list(request, reply) {
  try {
    const includeInactive =
      request.query.includeInactive === 'true' || request.query.includeInactive === true
    return await listProducts({ includeInactive })
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

export async function get(request, reply) {
  try {
    const product = await getProduct(request.params.id)
    if (!product) {
      reply.status(404).send({ error: 'Producto no encontrado' })
      return
    }
    return product
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

export async function create(request, reply) {
  try {
    const dup = validatePriceUniques(request.body.prices)
    if (dup) {
      reply.status(422).send({ error: dup })
      return
    }
    const product = await createProduct(request.body)
    reply.status(201).send(product)
  } catch (err) {
    if (err.status === 422) {
      reply.status(422).send({ error: err.message })
      return
    }
    if (err.code === 'P2002') {
      reply.status(422).send({ error: 'SKU o precio duplicado' })
      return
    }
    reply.status(500).send({ error: err.message })
  }
}

export async function patch(request, reply) {
  try {
    const dup = validatePriceUniques(request.body.prices)
    if (dup) {
      reply.status(422).send({ error: dup })
      return
    }
    const product = await updateProduct(request.params.id, request.body)
    if (!product) {
      reply.status(404).send({ error: 'Producto no encontrado' })
      return
    }
    return product
  } catch (err) {
    if (err.status === 422) {
      reply.status(422).send({ error: err.message })
      return
    }
    if (err.code === 'P2002') {
      reply.status(422).send({ error: 'SKU o precio duplicado' })
      return
    }
    reply.status(500).send({ error: err.message })
  }
}

export async function remove(request, reply) {
  try {
    const product = await deactivateProduct(request.params.id)
    if (!product) {
      reply.status(404).send({ error: 'Producto no encontrado' })
      return
    }
    return product
  } catch (err) {
    reply.status(500).send({ error: err.message })
  }
}

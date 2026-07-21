import { prisma } from './client.js'

export class StockError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'StockError'
    this.status = status
  }
}

function serializeMovement(row) {
  if (!row) return null
  return {
    ...row,
    unitCost: row.unitCost != null ? Number(row.unitCost) : null,
  }
}

function serializeLevel(row) {
  if (!row) return null
  return { ...row }
}

/**
 * @param {{ type: string, quantity?: number, delta?: number, unitCost?: number|null, note?: string|null, productId: string, variantId?: string|null, saleId?: string|null }} item
 */
function normalizeItem(item) {
  const { type, productId } = item
  const variantId = item.variantId ?? null
  const note = item.note?.trim() || null
  const saleId = item.saleId ?? null

  if (!productId) throw new StockError(422, 'productId es requerido')
  if (!['ENTRADA', 'SALIDA', 'AJUSTE'].includes(type)) {
    throw new StockError(422, `type inválido: ${type}`)
  }

  let quantity
  let delta

  if (type === 'AJUSTE') {
    if (item.delta == null || item.delta === 0 || !Number.isInteger(item.delta)) {
      throw new StockError(422, 'AJUSTE requiere delta entero distinto de 0')
    }
    if (!note) throw new StockError(422, 'AJUSTE requiere note')
    delta = item.delta
    quantity = Math.abs(delta)
  } else {
    if (item.quantity == null || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new StockError(422, `${type} requiere quantity entero ≥ 1`)
    }
    quantity = item.quantity
    delta = type === 'ENTRADA' ? quantity : -quantity
  }

  if (item.unitCost != null && type !== 'ENTRADA') {
    throw new StockError(422, 'unitCost solo aplica a ENTRADA')
  }
  if (item.unitCost != null && (typeof item.unitCost !== 'number' || item.unitCost < 0)) {
    throw new StockError(422, 'unitCost debe ser un número ≥ 0')
  }

  return {
    productId,
    variantId,
    saleId,
    type,
    quantity,
    delta,
    unitCost: type === 'ENTRADA' ? (item.unitCost ?? null) : null,
    note,
  }
}

/**
 * @param {{ active: boolean, variants: { id: string, active: boolean }[] }} product
 * @param {string|null} variantId
 */
function assertVariantCoherence(product, variantId) {
  if (!product.active) {
    throw new StockError(422, 'No se registran movimientos sobre productos inactivos')
  }
  const activeVariants = product.variants.filter((v) => v.active)
  if (activeVariants.length > 0) {
    if (!variantId) {
      throw new StockError(422, 'variantId es requerido para productos con variantes')
    }
    const variant = activeVariants.find((v) => v.id === variantId)
    if (!variant) {
      throw new StockError(422, 'Variante no encontrada o inactiva')
    }
  } else if (variantId) {
    throw new StockError(422, 'variantId debe ser null para productos sin variantes')
  }
}

/**
 * Lock or create StockLevel row inside a transaction.
 * @returns {Promise<{ id: string, quantity: number }>}
 */
async function lockOrCreateLevel(tx, productId, variantId) {
  const rows = variantId
    ? await tx.$queryRaw`
        SELECT id, quantity FROM stock_levels
        WHERE product_id = ${productId} AND variant_id = ${variantId}
        FOR UPDATE
      `
    : await tx.$queryRaw`
        SELECT id, quantity FROM stock_levels
        WHERE product_id = ${productId} AND variant_id IS NULL
        FOR UPDATE
      `

  if (rows.length > 0) {
    return { id: rows[0].id, quantity: rows[0].quantity }
  }

  const created = await tx.stockLevel.create({
    data: { productId, variantId, quantity: 0 },
  })
  // Re-lock in case of race (partial unique / unique constraint)
  const locked = variantId
    ? await tx.$queryRaw`
        SELECT id, quantity FROM stock_levels
        WHERE product_id = ${productId} AND variant_id = ${variantId}
        FOR UPDATE
      `
    : await tx.$queryRaw`
        SELECT id, quantity FROM stock_levels
        WHERE product_id = ${productId} AND variant_id IS NULL
        FOR UPDATE
      `
  return { id: locked[0]?.id ?? created.id, quantity: locked[0]?.quantity ?? 0 }
}

export async function listStockLevels() {
  const products = await prisma.product.findMany({
    where: { active: true },
    include: {
      variants: { where: { active: true }, orderBy: { name: 'asc' } },
      stockLevels: true,
    },
    orderBy: { name: 'asc' },
  })

  const items = []
  for (const product of products) {
    if (product.variants.length > 0) {
      for (const variant of product.variants) {
        const level = product.stockLevels.find((l) => l.variantId === variant.id)
        const quantity = level?.quantity ?? 0
        items.push({
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          minStock: product.minStock,
          quantity,
          lowStock: product.minStock != null && quantity <= product.minStock,
          levelId: level?.id ?? null,
          updatedAt: level?.updatedAt ?? null,
        })
      }
    } else {
      const level = product.stockLevels.find((l) => l.variantId == null)
      const quantity = level?.quantity ?? 0
      items.push({
        productId: product.id,
        productName: product.name,
        variantId: null,
        variantName: null,
        minStock: product.minStock,
        quantity,
        lowStock: product.minStock != null && quantity <= product.minStock,
        levelId: level?.id ?? null,
        updatedAt: level?.updatedAt ?? null,
      })
    }
  }
  return items
}

export async function getProductStock(productId, { movementsLimit = 20 } = {}) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: { where: { active: true }, orderBy: { name: 'asc' } },
      stockLevels: true,
    },
  })
  if (!product) return null

  const levels =
    product.variants.length > 0
      ? product.variants.map((variant) => {
          const level = product.stockLevels.find((l) => l.variantId === variant.id)
          const quantity = level?.quantity ?? 0
          return {
            productId: product.id,
            variantId: variant.id,
            variantName: variant.name,
            minStock: product.minStock,
            quantity,
            lowStock: product.minStock != null && quantity <= product.minStock,
            levelId: level?.id ?? null,
            updatedAt: level?.updatedAt ?? null,
          }
        })
      : (() => {
          const level = product.stockLevels.find((l) => l.variantId == null)
          const quantity = level?.quantity ?? 0
          return [
            {
              productId: product.id,
              variantId: null,
              variantName: null,
              minStock: product.minStock,
              quantity,
              lowStock: product.minStock != null && quantity <= product.minStock,
              levelId: level?.id ?? null,
              updatedAt: level?.updatedAt ?? null,
            },
          ]
        })()

  const limit = Math.min(Math.max(Number(movementsLimit) || 20, 1), 100)
  const movements = await prisma.stockMovement.findMany({
    where: { productId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return {
    productId: product.id,
    productName: product.name,
    minStock: product.minStock,
    levels,
    movements: movements.map(serializeMovement),
  }
}

export async function listMovements({
  productId,
  variantId,
  type,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const skip = Math.max(Number(offset) || 0, 0)

  const where = {}
  if (productId) where.productId = productId
  if (variantId !== undefined) {
    where.variantId = variantId === 'null' || variantId === '' ? null : variantId
  }
  if (type) where.type = type
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = new Date(from)
    if (to) where.createdAt.lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.stockMovement.count({ where }),
  ])

  return {
    items: items.map(serializeMovement),
    total,
    limit: take,
    offset: skip,
  }
}

/**
 * Apply movements inside an existing transaction (FOR UPDATE guard).
 * Used by createSale / voidSale so stock + sale share one TX.
 *
 * @param {import('../generated/prisma/client').Prisma.TransactionClient} tx
 * @param {object[]} items
 * @param {{ agentName?: string|null }} opts
 */
export async function applyMovementsInTx(tx, items, { agentName = null } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new StockError(422, 'movements debe ser un array no vacío')
  }
  if (items.length > 50) {
    throw new StockError(422, 'Máximo 50 movimientos por batch')
  }

  const normalized = items.map(normalizeItem)
  const results = []

  for (const item of normalized) {
    const product = await tx.product.findUnique({
      where: { id: item.productId },
      include: { variants: true },
    })
    if (!product) {
      throw new StockError(404, `Producto no encontrado: ${item.productId}`)
    }
    assertVariantCoherence(product, item.variantId)

    const level = await lockOrCreateLevel(tx, item.productId, item.variantId)
    const nextQty = level.quantity + item.delta
    if (nextQty < 0) {
      throw new StockError(
        422,
        `Stock insuficiente (actual ${level.quantity}, delta ${item.delta})`,
      )
    }

    const movement = await tx.stockMovement.create({
      data: {
        productId: item.productId,
        variantId: item.variantId,
        saleId: item.saleId,
        type: item.type,
        quantity: item.quantity,
        delta: item.delta,
        unitCost: item.unitCost,
        note: item.note,
        agentName,
      },
    })

    const updatedLevel = await tx.stockLevel.update({
      where: { id: level.id },
      data: { quantity: nextQty },
    })

    results.push({
      movement: serializeMovement(movement),
      level: serializeLevel(updatedLevel),
    })
  }

  return results
}

/**
 * @param {object[]} items
 * @param {{ agentName?: string|null }} opts
 */
export async function createMovements(items, { agentName = null } = {}) {
  return prisma.$transaction((tx) => applyMovementsInTx(tx, items, { agentName }))
}

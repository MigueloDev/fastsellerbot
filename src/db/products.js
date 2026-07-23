import { prisma } from './client.js'

function serializePrice(price) {
  return {
    ...price,
    amount: Number(price.amount),
  }
}

function serializeProduct(product) {
  if (!product) return null
  return {
    ...product,
    purchasePriceUsd:
      product.purchasePriceUsd != null ? Number(product.purchasePriceUsd) : null,
    prices: (product.prices ?? []).map(serializePrice),
  }
}

function activeInclude(includeInactive) {
  if (includeInactive) {
    return { variants: true, prices: true }
  }
  return {
    variants: { where: { active: true } },
    prices: { where: { active: true } },
  }
}

export async function listProducts({ includeInactive = false } = {}) {
  const products = await prisma.product.findMany({
    where: includeInactive ? undefined : { active: true },
    include: activeInclude(includeInactive),
    orderBy: { name: 'asc' },
  })
  return products.map(serializeProduct)
}

export async function getProduct(id, { includeInactive = true } = {}) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: activeInclude(includeInactive),
  })
  return serializeProduct(product)
}

export async function createProduct(data) {
  const {
    name,
    sku,
    brand,
    description,
    minStock,
    purchasePriceUsd,
    variants = [],
    prices = [],
  } = data

  if (purchasePriceUsd == null || !(Number(purchasePriceUsd) > 0)) {
    throw Object.assign(new Error('purchasePriceUsd debe ser > 0'), { status: 422 })
  }

  const product = await prisma.product.create({
    data: {
      name,
      sku: sku || null,
      brand: brand || null,
      description: description || null,
      minStock: minStock ?? null,
      purchasePriceUsd: Number(purchasePriceUsd),
      variants: {
        create: variants.map((v) => ({
          name: v.name,
          sku: v.sku || null,
        })),
      },
      prices: {
        create: prices.map((p) => ({
          ref: p.ref,
          amount: p.amount,
          minQty: p.minQty ?? 1,
        })),
      },
    },
    include: { variants: true, prices: true },
  })

  return serializeProduct(product)
}

export async function updateProduct(id, data) {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, prices: true },
  })
  if (!existing) return null

  const {
    name,
    sku,
    brand,
    description,
    active,
    minStock,
    purchasePriceUsd,
    variants,
    prices,
  } = data

  return prisma.$transaction(async (tx) => {
    const productData = {}
    if (name !== undefined) productData.name = name
    if (sku !== undefined) productData.sku = sku || null
    if (brand !== undefined) productData.brand = brand || null
    if (description !== undefined) productData.description = description || null
    if (active !== undefined) productData.active = active
    if (minStock !== undefined) productData.minStock = minStock ?? null
    if (purchasePriceUsd !== undefined) {
      if (purchasePriceUsd == null || !(Number(purchasePriceUsd) > 0)) {
        throw Object.assign(new Error('purchasePriceUsd debe ser > 0'), { status: 422 })
      }
      productData.purchasePriceUsd = Number(purchasePriceUsd)
    }

    if (Object.keys(productData).length > 0) {
      await tx.product.update({ where: { id }, data: productData })
    }

    // Reactivar catálogo completo cuando se vuelve a active: true sin payload anidado
    if (active === true && variants === undefined && prices === undefined) {
      await tx.productVariant.updateMany({
        where: { productId: id },
        data: { active: true },
      })
      await tx.productPrice.updateMany({
        where: { productId: id },
        data: { active: true },
      })
    }

    if (variants !== undefined) {
      const incomingIds = new Set(variants.filter((v) => v.id).map((v) => v.id))
      const toDeactivate = existing.variants.filter((v) => !incomingIds.has(v.id))
      if (toDeactivate.length > 0) {
        await tx.productVariant.updateMany({
          where: { id: { in: toDeactivate.map((v) => v.id) } },
          data: { active: false },
        })
      }
      for (const v of variants) {
        if (v.id) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: {
              name: v.name,
              sku: v.sku || null,
              active: v.active ?? true,
            },
          })
        } else {
          await tx.productVariant.create({
            data: {
              productId: id,
              name: v.name,
              sku: v.sku || null,
            },
          })
        }
      }
    }

    if (prices !== undefined) {
      // Reconciliar por clave natural (ref, minQty): evita P2002 al reactivar
      // un nivel que ya existía soft-deleted, y permite cambiar minQty sin
      // chocar con filas huérfanas.
      const priceKey = (ref, minQty) => `${ref}:${minQty ?? 1}`
      const incomingKeys = new Set(
        prices.map((p) => priceKey(p.ref, p.minQty ?? 1)),
      )
      const toDeactivate = existing.prices.filter(
        (p) => p.active && !incomingKeys.has(priceKey(p.ref, p.minQty)),
      )
      if (toDeactivate.length > 0) {
        await tx.productPrice.updateMany({
          where: { id: { in: toDeactivate.map((p) => p.id) } },
          data: { active: false },
        })
      }
      for (const p of prices) {
        const minQty = p.minQty ?? 1
        const match =
          existing.prices.find(
            (x) => x.ref === p.ref && x.minQty === minQty,
          ) ?? null
        if (match) {
          await tx.productPrice.update({
            where: { id: match.id },
            data: {
              amount: p.amount,
              active: p.active ?? true,
            },
          })
        } else {
          await tx.productPrice.create({
            data: {
              productId: id,
              ref: p.ref,
              amount: p.amount,
              minQty,
              active: p.active ?? true,
            },
          })
        }
      }
    }

    const updated = await tx.product.findUnique({
      where: { id },
      include: { variants: true, prices: true },
    })
    return serializeProduct(updated)
  })
}

export async function deactivateProduct(id) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) return null

  await prisma.$transaction([
    prisma.product.update({
      where: { id },
      data: { active: false },
    }),
    prisma.productVariant.updateMany({
      where: { productId: id },
      data: { active: false },
    }),
    prisma.productPrice.updateMany({
      where: { productId: id },
      data: { active: false },
    }),
  ])

  return getProduct(id)
}

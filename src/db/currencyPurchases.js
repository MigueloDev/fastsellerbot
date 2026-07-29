import { prisma } from './client.js'
import { round2 } from '../sales/balance.js'
import {
  saleProfitOf,
  currencyPurchaseProfitOf,
  expectedUsdt,
  fxAvailability,
  allocateUsdt,
} from '../sales/profit.js'

export class CurrencyPurchaseError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message)
    this.name = 'CurrencyPurchaseError'
    this.status = status
  }
}

function toNum(v) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber()
  return Number(v)
}

const SALE_SELECT = {
  id: true,
  status: true,
  totalUsd: true,
  priceRef: true,
  createdAt: true,
  customer: { select: { id: true, name: true, cedula: true } },
}

const SALE_FOR_PURCHASE = {
  customer: { select: { id: true, name: true, cedula: true } },
  items: true,
  payments: { orderBy: { paidAt: 'asc' } },
  currencyPurchaseAllocations: { orderBy: { id: 'asc' } },
}

const PURCHASE_INCLUDE = {
  allocations: {
    include: { sale: { select: SALE_SELECT } },
    orderBy: { id: 'asc' },
  },
}

function serializeSaleBrief(sale) {
  if (!sale) return null
  return {
    id: sale.id,
    status: sale.status,
    totalUsd: toNum(sale.totalUsd),
    priceRef: sale.priceRef,
    createdAt: sale.createdAt,
    customer: sale.customer ?? null,
  }
}

function serializeAllocation(row) {
  return {
    id: row.id,
    purchaseId: row.purchaseId,
    saleId: row.saleId,
    bsSpent: toNum(row.bsSpent),
    usdCollected: toNum(row.usdCollected),
    usdtReceived: toNum(row.usdtReceived),
    costUsd: row.costUsd != null ? toNum(row.costUsd) : null,
    profitUsd: row.profitUsd != null ? toNum(row.profitUsd) : null,
    sale: serializeSaleBrief(row.sale),
  }
}

function profitFromAllocations(allocations = []) {
  let any = false
  let sum = 0
  for (const a of allocations) {
    if (a.profitUsd != null) {
      any = true
      sum += toNum(a.profitUsd)
    }
  }
  return any ? round2(sum) : null
}

function serializePurchase(row) {
  if (!row) return null
  const allocations = (row.allocations ?? []).map(serializeAllocation)
  const first = allocations[0] ?? null
  const { receiptPath, ...rest } = row
  return {
    id: rest.id,
    saleId: first?.saleId ?? null,
    binanceRate: toNum(rest.binanceRate),
    bsSpent: toNum(rest.bsSpent),
    usdtReceived: toNum(rest.usdtReceived),
    usdCollected: toNum(rest.usdCollected),
    costUsd: rest.costUsd != null ? toNum(rest.costUsd) : null,
    profitUsd: profitFromAllocations(row.allocations) ??
      (rest.profitUsd != null ? toNum(rest.profitUsd) : null),
    expectedUsdt: expectedUsdt(toNum(rest.bsSpent), toNum(rest.binanceRate)),
    note: rest.note,
    agentName: rest.agentName,
    hasReceipt: Boolean(receiptPath),
    purchasedAt: rest.purchasedAt,
    createdAt: rest.createdAt,
    allocations,
    sale: first?.sale ?? undefined,
  }
}

function eligibleFromSale(sale) {
  if (!sale || sale.status === 'ANULADA') return null
  const fx = fxAvailability(sale.payments, sale.currencyPurchaseAllocations)
  if (!(fx.bsAvailable > 0)) return null
  const items = (sale.items ?? []).map((it) => ({
    quantity: it.quantity,
    unitCostUsd: it.unitCostUsd != null ? toNum(it.unitCostUsd) : null,
  }))
  const profit = saleProfitOf({ totalUsd: sale.totalUsd, items })
  return {
    id: sale.id,
    status: sale.status,
    priceRef: sale.priceRef,
    totalUsd: toNum(sale.totalUsd),
    createdAt: sale.createdAt,
    customer: sale.customer,
    bsSpent: fx.bsAvailable,
    bsConverted: fx.bsConverted,
    usdCollected: fx.usdAvailable,
    usdAttributed: fx.usdAttributed,
    usdtConverted: fx.usdtReceived,
    costUsd: profit.costUsd,
    paymentsCount: sale.payments?.length ?? 0,
    purchasesCount: sale.currencyPurchaseAllocations?.length ?? 0,
  }
}

/**
 * Estampa COGS/profit en la allocation más reciente cuando la venta está PAGADA
 * y ya no quedan Bs por convertir. No-op si ya hay profit o faltan Bs.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient | typeof prisma} db
 * @param {string} saleId
 */
export async function stampClosingProfitIfNeeded(db, saleId) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      items: true,
      payments: true,
      currencyPurchaseAllocations: {
        include: { purchase: { select: { id: true, purchasedAt: true, usdCollected: true } } },
      },
    },
  })
  if (!sale || sale.status !== 'PAGADA') return null
  if (!sale.currencyPurchaseAllocations?.length) return null

  const fx = fxAvailability(sale.payments, sale.currencyPurchaseAllocations)
  if (fx.bsAvailable > 0) return null
  if (sale.currencyPurchaseAllocations.some((a) => a.profitUsd != null)) return null

  const items = (sale.items ?? []).map((it) => ({
    quantity: it.quantity,
    unitCostUsd: it.unitCostUsd != null ? toNum(it.unitCostUsd) : null,
  }))
  const { costUsd } = saleProfitOf({ totalUsd: sale.totalUsd, items })
  const latest = [...sale.currencyPurchaseAllocations].sort(
    (a, b) =>
      new Date(a.purchase.purchasedAt).getTime() -
      new Date(b.purchase.purchasedAt).getTime(),
  ).at(-1)
  const { profitUsd } = currencyPurchaseProfitOf({
    usdtReceived: fx.usdtReceived,
    usdCollected: fx.usdAttributed + fx.usdAvailable,
    costUsd,
  })

  const updatedAlloc = await db.currencyPurchaseAllocation.update({
    where: { id: latest.id },
    data: {
      usdCollected: round2(toNum(latest.usdCollected) + fx.usdAvailable),
      costUsd,
      profitUsd,
    },
  })

  if (fx.usdAvailable > 0) {
    await db.currencyPurchase.update({
      where: { id: latest.purchase.id },
      data: {
        usdCollected: round2(toNum(latest.purchase.usdCollected) + fx.usdAvailable),
      },
    })
  }

  return updatedAlloc
}

/**
 * @param {{ limit?: number, offset?: number }} opts
 */
export async function listCurrencyPurchases({ limit = 50, offset = 0 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const skip = Math.max(Number(offset) || 0, 0)

  const [rows, total, headerAgg, allocAgg] = await Promise.all([
    prisma.currencyPurchase.findMany({
      include: PURCHASE_INCLUDE,
      orderBy: { purchasedAt: 'desc' },
      take,
      skip,
    }),
    prisma.currencyPurchase.count(),
    prisma.currencyPurchase.aggregate({
      _sum: {
        bsSpent: true,
        usdtReceived: true,
        usdCollected: true,
      },
      _count: { _all: true },
    }),
    prisma.currencyPurchaseAllocation.aggregate({
      _sum: { profitUsd: true },
    }),
  ])

  return {
    items: rows.map(serializePurchase),
    total,
    limit: take,
    offset: skip,
    summary: {
      count: headerAgg._count._all,
      bsSpent: round2(toNum(headerAgg._sum.bsSpent)),
      usdtAcquired: round2(toNum(headerAgg._sum.usdtReceived)),
      usdCollected: round2(toNum(headerAgg._sum.usdCollected)),
      profitUsd:
        allocAgg._sum.profitUsd != null
          ? round2(toNum(allocAgg._sum.profitUsd))
          : null,
    },
  }
}

/** Ventas con Bs cobrados aún no convertidos (parcial o total). */
export async function listEligibleSales({ limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  // ponytail: over-fetch then filter by bsAvailable; upgrade a raw SQL si la lista crece
  const sales = await prisma.sale.findMany({
    where: {
      status: { not: 'ANULADA' },
      payments: { some: { currency: 'BS' } },
    },
    include: SALE_FOR_PURCHASE,
    orderBy: { createdAt: 'desc' },
    take: Math.min(take * 3, 150),
  })
  return sales.map(eligibleFromSale).filter(Boolean).slice(0, take)
}

/**
 * @param {string} purchaseId
 * @returns {Promise<{ id: string, receiptPath: string|null } | null>}
 */
export async function findCurrencyPurchaseReceipt(purchaseId) {
  const row = await prisma.currencyPurchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, receiptPath: true },
  })
  return row
}

/**
 * @param {{
 *   id?: string,
 *   saleIds?: string[],
 *   saleId?: string,
 *   binanceRate: number,
 *   usdtReceived: number,
 *   note?: string|null,
 *   agentName?: string|null,
 *   receiptPath?: string|null,
 * }} input
 */
export async function createCurrencyPurchase(input) {
  const {
    id: purchaseId,
    binanceRate,
    usdtReceived,
    note = null,
    agentName = null,
    receiptPath = null,
  } = input

  const rawIds = Array.isArray(input.saleIds) && input.saleIds.length
    ? input.saleIds
    : input.saleId
      ? [input.saleId]
      : []
  const saleIds = [...new Set(rawIds.map((s) => String(s || '').trim()).filter(Boolean))]
  if (!saleIds.length) {
    throw new CurrencyPurchaseError(422, 'saleIds es requerido')
  }

  const rate = Number(binanceRate)
  if (!Number.isFinite(rate) || !(rate > 0)) {
    throw new CurrencyPurchaseError(422, 'binanceRate debe ser > 0')
  }
  const usdt = Number(usdtReceived)
  if (!Number.isFinite(usdt) || !(usdt > 0)) {
    throw new CurrencyPurchaseError(422, 'usdtReceived debe ser > 0')
  }

  const usdtRounded = Math.round(usdt * 1e6) / 1e6
  const rateRounded = Math.round(rate * 1e4) / 1e4

  const created = await prisma.$transaction(async (tx) => {
    /** @type {Array<{ sale: any, fx: ReturnType<typeof fxAvailability>, bsSpent: number, usdCollected: number }>} */
    const rows = []
    for (const saleId of saleIds) {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: SALE_FOR_PURCHASE,
      })
      if (!sale) throw new CurrencyPurchaseError(404, `Venta no encontrada: ${saleId}`)
      if (sale.status === 'ANULADA') {
        throw new CurrencyPurchaseError(422, `Venta anulada: ${saleId}`)
      }
      const fx = fxAvailability(sale.payments, sale.currencyPurchaseAllocations)
      if (!(fx.bsAvailable > 0)) {
        throw new CurrencyPurchaseError(
          422,
          `No hay bolívares pendientes de convertir: ${saleId}`,
        )
      }
      rows.push({
        sale,
        fx,
        bsSpent: fx.bsAvailable,
        usdCollected: fx.usdAvailable,
      })
    }

    const bsAmounts = rows.map((r) => r.bsSpent)
    const usdtShares = allocateUsdt(bsAmounts, usdtRounded)
    const bsSpentTotal = round2(bsAmounts.reduce((a, b) => a + b, 0))
    const usdCollectedTotal = round2(rows.reduce((a, r) => a + r.usdCollected, 0))

    const allocCreate = rows.map((r, i) => {
      const share = usdtShares[i]
      // consume todo el disponible → remaining Bs = 0
      const isClosing = r.sale.status === 'PAGADA'
      let costUsd = null
      let profitUsd = null
      if (isClosing) {
        const items = (r.sale.items ?? []).map((it) => ({
          quantity: it.quantity,
          unitCostUsd: it.unitCostUsd != null ? toNum(it.unitCostUsd) : null,
        }))
        ;({ costUsd } = saleProfitOf({ totalUsd: r.sale.totalUsd, items }))
        ;({ profitUsd } = currencyPurchaseProfitOf({
          usdtReceived: r.fx.usdtReceived + share,
          usdCollected: r.fx.usdAttributed + r.usdCollected,
          costUsd,
        }))
      }
      return {
        saleId: r.sale.id,
        bsSpent: r.bsSpent,
        usdCollected: r.usdCollected,
        usdtReceived: share,
        costUsd,
        profitUsd,
      }
    })

    return tx.currencyPurchase.create({
      data: {
        ...(purchaseId ? { id: purchaseId } : {}),
        binanceRate: rateRounded,
        bsSpent: bsSpentTotal,
        usdtReceived: usdtRounded,
        usdCollected: usdCollectedTotal,
        costUsd: null,
        profitUsd: null,
        note: note?.trim() || null,
        agentName,
        receiptPath: receiptPath || null,
        allocations: { create: allocCreate },
      },
      include: PURCHASE_INCLUDE,
    })
  })

  return serializePurchase(created)
}

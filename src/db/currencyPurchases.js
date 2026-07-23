import { prisma } from './client.js'
import { round2 } from '../sales/balance.js'
import {
  saleProfitOf,
  currencyPurchaseProfitOf,
  expectedUsdt,
  paymentCurrencyTotals,
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

const SALE_FOR_PURCHASE = {
  customer: { select: { id: true, name: true, cedula: true } },
  items: true,
  payments: { orderBy: { paidAt: 'asc' } },
  currencyPurchase: true,
}

function serializePurchase(row) {
  if (!row) return null
  const sale = row.sale
    ? {
        id: row.sale.id,
        status: row.sale.status,
        totalUsd: toNum(row.sale.totalUsd),
        priceRef: row.sale.priceRef,
        createdAt: row.sale.createdAt,
        customer: row.sale.customer ?? null,
      }
    : undefined
  return {
    id: row.id,
    saleId: row.saleId,
    binanceRate: toNum(row.binanceRate),
    bsSpent: toNum(row.bsSpent),
    usdtReceived: toNum(row.usdtReceived),
    usdCollected: toNum(row.usdCollected),
    costUsd: row.costUsd != null ? toNum(row.costUsd) : null,
    profitUsd: row.profitUsd != null ? toNum(row.profitUsd) : null,
    expectedUsdt: expectedUsdt(toNum(row.bsSpent), toNum(row.binanceRate)),
    note: row.note,
    agentName: row.agentName,
    purchasedAt: row.purchasedAt,
    createdAt: row.createdAt,
    sale,
  }
}

function eligibleFromSale(sale) {
  if (!sale || sale.status !== 'PAGADA') return null
  if (sale.currencyPurchase) return null
  const { bsSpent, usdCollected } = paymentCurrencyTotals(sale.payments)
  if (!(bsSpent > 0)) return null
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
    bsSpent,
    usdCollected,
    costUsd: profit.costUsd,
    paymentsCount: sale.payments?.length ?? 0,
  }
}

/**
 * @param {{ limit?: number, offset?: number }} opts
 */
export async function listCurrencyPurchases({ limit = 50, offset = 0 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const skip = Math.max(Number(offset) || 0, 0)

  const [rows, total, agg] = await Promise.all([
    prisma.currencyPurchase.findMany({
      include: {
        sale: {
          select: {
            id: true,
            status: true,
            totalUsd: true,
            priceRef: true,
            createdAt: true,
            customer: { select: { id: true, name: true, cedula: true } },
          },
        },
      },
      orderBy: { purchasedAt: 'desc' },
      take,
      skip,
    }),
    prisma.currencyPurchase.count(),
    prisma.currencyPurchase.aggregate({
      _sum: {
        bsSpent: true,
        usdtReceived: true,
        profitUsd: true,
        usdCollected: true,
      },
      _count: { _all: true },
    }),
  ])

  return {
    items: rows.map(serializePurchase),
    total,
    limit: take,
    offset: skip,
    summary: {
      count: agg._count._all,
      bsSpent: round2(toNum(agg._sum.bsSpent)),
      usdtAcquired: round2(toNum(agg._sum.usdtReceived)),
      usdCollected: round2(toNum(agg._sum.usdCollected)),
      profitUsd: agg._sum.profitUsd != null ? round2(toNum(agg._sum.profitUsd)) : null,
    },
  }
}

/** Ventas PAGADA con pagos Bs y sin compra de divisas previa. */
export async function listEligibleSales({ limit = 50 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 50, 1), 100)
  const sales = await prisma.sale.findMany({
    where: {
      status: 'PAGADA',
      currencyPurchase: null,
      payments: { some: { currency: 'BS' } },
    },
    include: SALE_FOR_PURCHASE,
    orderBy: { createdAt: 'desc' },
    take,
  })
  return sales.map(eligibleFromSale).filter(Boolean)
}

/**
 * @param {{ saleId: string, binanceRate: number, usdtReceived: number, note?: string|null, agentName?: string|null }} input
 */
export async function createCurrencyPurchase(input) {
  const { saleId, binanceRate, usdtReceived, note = null, agentName = null } = input

  if (!saleId) throw new CurrencyPurchaseError(422, 'saleId es requerido')
  const rate = Number(binanceRate)
  if (!Number.isFinite(rate) || !(rate > 0)) {
    throw new CurrencyPurchaseError(422, 'binanceRate debe ser > 0')
  }
  const usdt = Number(usdtReceived)
  if (!Number.isFinite(usdt) || !(usdt > 0)) {
    throw new CurrencyPurchaseError(422, 'usdtReceived debe ser > 0')
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: SALE_FOR_PURCHASE,
      })
      if (!sale) throw new CurrencyPurchaseError(404, 'Venta no encontrada')
      if (sale.status === 'ANULADA') {
        throw new CurrencyPurchaseError(422, 'Venta anulada')
      }
      if (sale.status !== 'PAGADA') {
        throw new CurrencyPurchaseError(422, 'Solo ventas PAGADA pueden convertir a USDT')
      }
      if (sale.currencyPurchase) {
        throw new CurrencyPurchaseError(409, 'Esta venta ya tiene una compra de divisas')
      }

      const { bsSpent, usdCollected } = paymentCurrencyTotals(sale.payments)
      if (!(bsSpent > 0)) {
        throw new CurrencyPurchaseError(422, 'La venta no tiene pagos en bolívares')
      }

      const items = (sale.items ?? []).map((it) => ({
        quantity: it.quantity,
        unitCostUsd: it.unitCostUsd != null ? toNum(it.unitCostUsd) : null,
      }))
      const { costUsd } = saleProfitOf({ totalUsd: sale.totalUsd, items })
      const { profitUsd } = currencyPurchaseProfitOf({
        usdtReceived: usdt,
        usdCollected,
        costUsd,
      })

      // round USDT to 6 decimals; Binance rate to 4
      const usdtRounded = Math.round(usdt * 1e6) / 1e6
      const rateRounded = Math.round(rate * 1e4) / 1e4

      return tx.currencyPurchase.create({
        data: {
          saleId,
          binanceRate: rateRounded,
          bsSpent,
          usdtReceived: usdtRounded,
          usdCollected,
          costUsd,
          profitUsd,
          note: note?.trim() || null,
          agentName,
        },
        include: {
          sale: {
            select: {
              id: true,
              status: true,
              totalUsd: true,
              priceRef: true,
              createdAt: true,
              customer: { select: { id: true, name: true, cedula: true } },
            },
          },
        },
      })
    })

    return serializePurchase(created)
  } catch (err) {
    if (err instanceof CurrencyPurchaseError) throw err
    if (err?.code === 'P2002') {
      throw new CurrencyPurchaseError(409, 'Esta venta ya tiene una compra de divisas')
    }
    throw err
  }
}

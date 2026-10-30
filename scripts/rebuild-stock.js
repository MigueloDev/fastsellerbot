/**
 * Rebuild StockLevel cache from StockMovement ledger.
 * Usage: node scripts/rebuild-stock.js
 */
import 'dotenv/config'
import { prisma } from '../src/db/client.js'

async function rebuildStock() {
  const sums = await prisma.$queryRaw`
    SELECT product_id AS "productId",
           variant_id AS "variantId",
           COALESCE(SUM(delta), 0)::int AS quantity
    FROM stock_movements
    GROUP BY product_id, variant_id
  `

  await prisma.$transaction(async (tx) => {
    await tx.stockLevel.deleteMany()
    for (const row of sums) {
      await tx.stockLevel.create({
        data: {
          productId: row.productId,
          variantId: row.variantId ?? null,
          quantity: row.quantity,
        },
      })
    }
  })

  console.log(`Rebuilt ${sums.length} stock level(s)`)
}

rebuildStock()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

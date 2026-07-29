-- CreateTable
CREATE TABLE "currency_purchase_allocations" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "bs_spent" DECIMAL(14,2) NOT NULL,
    "usd_collected" DECIMAL(12,2) NOT NULL,
    "usdt_received" DECIMAL(14,6) NOT NULL,
    "cost_usd" DECIMAL(12,2),
    "profit_usd" DECIMAL(12,2),

    CONSTRAINT "currency_purchase_allocations_pkey" PRIMARY KEY ("id")
);

-- Backfill: cada compra existente → 1 allocation (preserva montos, venta, profit)
INSERT INTO "currency_purchase_allocations" (
    "id",
    "purchase_id",
    "sale_id",
    "bs_spent",
    "usd_collected",
    "usdt_received",
    "cost_usd",
    "profit_usd"
)
SELECT
    'c' || substr(md5("id" || 'alloc'), 1, 24),
    "id",
    "sale_id",
    "bs_spent",
    "usd_collected",
    "usdt_received",
    "cost_usd",
    "profit_usd"
FROM "currency_purchases";

-- CreateIndex
CREATE UNIQUE INDEX "currency_purchase_allocations_purchase_id_sale_id_key" ON "currency_purchase_allocations"("purchase_id", "sale_id");

-- CreateIndex
CREATE INDEX "currency_purchase_allocations_sale_id_idx" ON "currency_purchase_allocations"("sale_id");

-- CreateIndex
CREATE INDEX "currency_purchase_allocations_purchase_id_idx" ON "currency_purchase_allocations"("purchase_id");

-- AddForeignKey
ALTER TABLE "currency_purchase_allocations" ADD CONSTRAINT "currency_purchase_allocations_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "currency_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_purchase_allocations" ADD CONSTRAINT "currency_purchase_allocations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "currency_purchases" DROP CONSTRAINT "currency_purchases_sale_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "currency_purchases_sale_id_idx";

-- AlterTable
ALTER TABLE "currency_purchases" DROP COLUMN "sale_id";

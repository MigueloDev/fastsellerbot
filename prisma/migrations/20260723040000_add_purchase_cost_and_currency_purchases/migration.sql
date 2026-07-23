-- AlterTable
ALTER TABLE "products" ADD COLUMN "purchase_price_usd" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN "unit_cost_usd" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "currency_purchases" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "binance_rate" DECIMAL(14,4) NOT NULL,
    "bs_spent" DECIMAL(14,2) NOT NULL,
    "usdt_received" DECIMAL(14,6) NOT NULL,
    "usd_collected" DECIMAL(12,2) NOT NULL,
    "cost_usd" DECIMAL(12,2),
    "profit_usd" DECIMAL(12,2),
    "note" TEXT,
    "agent_name" TEXT,
    "purchased_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "currency_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "currency_purchases_sale_id_key" ON "currency_purchases"("sale_id");

-- CreateIndex
CREATE INDEX "currency_purchases_purchased_at_idx" ON "currency_purchases"("purchased_at" DESC);

-- AddForeignKey
ALTER TABLE "currency_purchases" ADD CONSTRAINT "currency_purchases_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- AlterTable
ALTER TABLE "currency_purchases" ADD COLUMN     "from_account_id" TEXT,
ADD COLUMN     "to_account_id" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "account_id" TEXT;

-- CreateTable
CREATE TABLE "cash_accounts" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "currency" "PaymentCurrency" NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "delta" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "agent_name" TEXT,
    "payment_id" TEXT,
    "currency_purchase_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_accounts_alias_key" ON "cash_accounts"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_payment_id_key" ON "cash_movements"("payment_id");

-- CreateIndex
CREATE INDEX "cash_movements_account_id_created_at_idx" ON "cash_movements"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "cash_movements_currency_purchase_id_idx" ON "cash_movements"("currency_purchase_id");

-- CreateIndex
CREATE INDEX "currency_purchases_from_account_id_idx" ON "currency_purchases"("from_account_id");

-- CreateIndex
CREATE INDEX "currency_purchases_to_account_id_idx" ON "currency_purchases"("to_account_id");

-- CreateIndex
CREATE INDEX "payments_account_id_idx" ON "payments"("account_id");

-- AddForeignKey
ALTER TABLE "currency_purchases" ADD CONSTRAINT "currency_purchases_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_purchases" ADD CONSTRAINT "currency_purchases_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_currency_purchase_id_fkey" FOREIGN KEY ("currency_purchase_id") REFERENCES "currency_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: dos bolsillos activos (saldos en 0; sin backfill de pagos/compras)
INSERT INTO "cash_accounts" ("id", "alias", "institution", "holder", "currency", "balance", "active", "created_at", "updated_at")
VALUES
  ('cbanescocashaccount00001', 'Miguelo Banesco', 'Banesco', 'Miguel Paez', 'BS', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cbinancecashaccount00001', 'Miguel Paez Binance', 'Binance', 'Miguel Paez', 'USD', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

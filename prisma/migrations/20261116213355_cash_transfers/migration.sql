-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "transfer_id" TEXT;

-- CreateTable
CREATE TABLE "cash_transfers" (
    "id" TEXT NOT NULL,
    "from_account_id" TEXT NOT NULL,
    "to_account_id" TEXT NOT NULL,
    "amount_sent" DECIMAL(14,2) NOT NULL,
    "fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "amount_received" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "agent_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_transfers_from_account_id_idx" ON "cash_transfers"("from_account_id");

-- CreateIndex
CREATE INDEX "cash_transfers_to_account_id_idx" ON "cash_transfers"("to_account_id");

-- CreateIndex
CREATE INDEX "cash_transfers_created_at_idx" ON "cash_transfers"("created_at" DESC);

-- CreateIndex
CREATE INDEX "cash_movements_transfer_id_idx" ON "cash_movements"("transfer_id");

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "cash_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "cash_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('POR_ENTREGAR', 'ENTREGADA');

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'POR_ENTREGAR',
ADD COLUMN "delivered_at" TIMESTAMP(3),
ADD COLUMN "delivered_by" TEXT;

-- Backfill: ventas previas ya descontaron stock al crearse (SALIDA en el ledger),
-- así que se consideran entregadas y no deben poder entregarse otra vez.
UPDATE "sales"
SET "delivery_status" = 'ENTREGADA',
    "delivered_at" = "created_at";

-- CreateIndex
CREATE INDEX "sales_delivery_status_idx" ON "sales"("delivery_status");

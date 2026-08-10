-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('ACTIVA', 'ANULADA');

-- CreateTable
CREATE TABLE "delivery_notes" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customer_id" TEXT NOT NULL,
    "show_value" BOOLEAN NOT NULL DEFAULT true,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'ACTIVA',
    "note" TEXT,
    "agent_name" TEXT,
    "total_usd" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "voided_by" TEXT,

    CONSTRAINT "delivery_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_note_items" (
    "id" TEXT NOT NULL,
    "delivery_note_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price_usd" DECIMAL(12,2) NOT NULL,
    "subtotal_usd" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "delivery_note_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "delivery_note_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_number_key" ON "delivery_notes"("number");

-- CreateIndex
CREATE INDEX "delivery_notes_created_at_idx" ON "delivery_notes"("created_at" DESC);

-- CreateIndex
CREATE INDEX "delivery_notes_status_idx" ON "delivery_notes"("status");

-- CreateIndex
CREATE INDEX "stock_movements_delivery_note_id_idx" ON "stock_movements"("delivery_note_id");

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_note_items" ADD CONSTRAINT "delivery_note_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_delivery_note_id_fkey" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

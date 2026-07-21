-- AlterTable
ALTER TABLE "customers" ADD COLUMN "cedula" TEXT,
ADD COLUMN "first_name" TEXT,
ADD COLUMN "last_name" TEXT;

-- Backfill legacy rows
UPDATE "customers"
SET "first_name" = "name",
    "last_name" = ''
WHERE "first_name" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "customers" ALTER COLUMN "first_name" SET NOT NULL,
ALTER COLUMN "last_name" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "customers_cedula_key" ON "customers"("cedula");

-- CreateIndex
CREATE INDEX "customers_last_name_first_name_idx" ON "customers"("last_name", "first_name");

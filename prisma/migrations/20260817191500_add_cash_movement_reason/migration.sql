-- CreateEnum
CREATE TYPE "CashMovementReason" AS ENUM ('MANUAL', 'GASTO', 'PRESTAMO');

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN "reason" "CashMovementReason" NOT NULL DEFAULT 'MANUAL';

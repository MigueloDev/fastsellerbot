-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'VENDEDOR');

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'VENDEDOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_clerk_user_id_key" ON "staff"("clerk_user_id");

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "seller_id" TEXT;

-- CreateIndex
CREATE INDEX "sales_seller_id_idx" ON "sales"("seller_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

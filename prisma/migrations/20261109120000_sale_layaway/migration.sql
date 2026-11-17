-- CreateTable
CREATE TABLE "sale_layaways" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "down_payment_usd" DECIMAL(12,2) NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 4,
    "every_days" INTEGER NOT NULL DEFAULT 7,
    "deadline_days" INTEGER NOT NULL DEFAULT 30,
    "penalty_pct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "serial" TEXT,

    CONSTRAINT "sale_layaways_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sale_layaways_sale_id_key" ON "sale_layaways"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_layaways_number_key" ON "sale_layaways"("number");

-- AddForeignKey
ALTER TABLE "sale_layaways" ADD CONSTRAINT "sale_layaways_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

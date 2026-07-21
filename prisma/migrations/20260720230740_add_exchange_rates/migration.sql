-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('BCV', 'BINANCE');

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "source" "RateSource" NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_source_fetched_at_idx" ON "exchange_rates"("source", "fetched_at" DESC);

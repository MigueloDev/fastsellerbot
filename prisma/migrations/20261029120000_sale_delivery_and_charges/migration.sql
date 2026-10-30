-- Entrega (tipo + dirección/ubicación) por venta, última dirección en cliente,
-- y costos/gastos asociados a la venta (sale_charges).

CREATE TYPE "DeliveryType" AS ENUM ('RETIRO', 'DELIVERY', 'FORANEA');
CREATE TYPE "SaleChargeKind" AS ENUM ('DELIVERY', 'ENVIO', 'COMISION', 'OTRO');

ALTER TABLE "sales" ADD COLUMN "delivery_type" "DeliveryType" NOT NULL DEFAULT 'RETIRO';
ALTER TABLE "sales" ADD COLUMN "delivery_address" TEXT;
ALTER TABLE "sales" ADD COLUMN "delivery_reference" TEXT;
ALTER TABLE "sales" ADD COLUMN "delivery_lat" DECIMAL(9,6);
ALTER TABLE "sales" ADD COLUMN "delivery_lng" DECIMAL(9,6);

ALTER TABLE "customers" ADD COLUMN "address" TEXT;
ALTER TABLE "customers" ADD COLUMN "address_reference" TEXT;
ALTER TABLE "customers" ADD COLUMN "lat" DECIMAL(9,6);
ALTER TABLE "customers" ADD COLUMN "lng" DECIMAL(9,6);

CREATE TABLE "sale_charges" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "kind" "SaleChargeKind" NOT NULL,
    "description" TEXT,
    "amount_usd" DECIMAL(12,2) NOT NULL,
    "billed_to_customer" BOOLEAN NOT NULL DEFAULT false,
    "agent_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_charges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_charges_sale_id_idx" ON "sale_charges"("sale_id");

ALTER TABLE "sale_charges" ADD CONSTRAINT "sale_charges_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Idempotencia offline (app móvil vendedores) + evidencia de venta.
-- client_id es NULL en todas las filas existentes; Postgres permite múltiples
-- NULL en una columna UNIQUE, así que no hace falta backfill.

ALTER TABLE "customers" ADD COLUMN "client_id" TEXT;
ALTER TABLE "customers" ADD CONSTRAINT "customers_client_id_key" UNIQUE ("client_id");

ALTER TABLE "sales" ADD COLUMN "client_id" TEXT;
ALTER TABLE "sales" ADD CONSTRAINT "sales_client_id_key" UNIQUE ("client_id");
ALTER TABLE "sales" ADD COLUMN "evidence_path" TEXT;

ALTER TABLE "payments" ADD COLUMN "client_id" TEXT;
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_key" UNIQUE ("client_id");

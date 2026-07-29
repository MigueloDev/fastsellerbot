-- Allow multiple currency purchases per sale (drop 1:1 unique on sale_id).
DROP INDEX IF EXISTS "currency_purchases_sale_id_key";

CREATE INDEX IF NOT EXISTS "currency_purchases_sale_id_idx" ON "currency_purchases"("sale_id");

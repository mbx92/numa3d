ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "list_price" integer NOT NULL DEFAULT 0;
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "hpp_per_unit" integer;
ALTER TABLE "custom_orders" ADD COLUMN IF NOT EXISTS "failure_rate_percent" real NOT NULL DEFAULT 5;
ALTER TABLE "custom_orders" ADD COLUMN IF NOT EXISTS "labor_minutes" integer NOT NULL DEFAULT 0;
ALTER TABLE "custom_orders" ADD COLUMN IF NOT EXISTS "labor_rate_per_hour" integer NOT NULL DEFAULT 0;
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "price_round_step" integer NOT NULL DEFAULT 500;

DROP INDEX IF EXISTS "productions_custom_order_id_uidx";--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "retry_of_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "productions_retry_of_id_uidx" ON "productions" ("retry_of_id") WHERE "retry_of_id" IS NOT NULL;

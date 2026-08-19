ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "invoice_number" text;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "customer_name" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "invoice_business_name" text DEFAULT 'Numa3D' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "invoice_address" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "invoice_phone" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "invoice_footer" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_invoice_number_uidx" ON "sales" ("invoice_number") WHERE "invoice_number" IS NOT NULL;

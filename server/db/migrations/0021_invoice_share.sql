ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "invoice_share_ttl_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_share_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoice_share_links" ADD CONSTRAINT "invoice_share_links_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_share_links_token_uidx" ON "invoice_share_links" ("token");

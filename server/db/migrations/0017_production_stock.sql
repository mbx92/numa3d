DO $$ BEGIN
  CREATE TYPE "public"."production_status" AS ENUM('queued', 'in_progress', 'done', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "productions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"product_id" integer NOT NULL,
	"machine_id" integer,
	"quantity_planned" integer DEFAULT 1 NOT NULL,
	"quantity_good" integer DEFAULT 0 NOT NULL,
	"quantity_failed" integer DEFAULT 0 NOT NULL,
	"status" "production_status" DEFAULT 'queued' NOT NULL,
	"notes" text,
	"stock_applied" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "productions" ADD CONSTRAINT "productions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "productions" ADD CONSTRAINT "productions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

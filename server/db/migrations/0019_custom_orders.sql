DO $$ BEGIN
  CREATE TYPE "public"."custom_order_status" AS ENUM('open', 'ready', 'delivered', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"customer_name" text NOT NULL,
	"title" text NOT NULL,
	"channel" "sales_channel" DEFAULT 'direct' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price_per_unit" integer DEFAULT 0 NOT NULL,
	"material_id" integer NOT NULL,
	"material_quantity_used" real DEFAULT 0 NOT NULL,
	"packaging_id" integer,
	"packaging_quantity_used" real DEFAULT 0 NOT NULL,
	"machine_id" integer,
	"print_time_minutes" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"status" "custom_order_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_order_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"custom_order_id" integer NOT NULL,
	"filename" text NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"content_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "productions" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "custom_order_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "custom_order_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_orders" ADD CONSTRAINT "custom_orders_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_orders" ADD CONSTRAINT "custom_orders_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_orders" ADD CONSTRAINT "custom_orders_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_order_files" ADD CONSTRAINT "custom_order_files_custom_order_id_custom_orders_id_fk" FOREIGN KEY ("custom_order_id") REFERENCES "public"."custom_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "productions" ADD CONSTRAINT "productions_custom_order_id_custom_orders_id_fk" FOREIGN KEY ("custom_order_id") REFERENCES "public"."custom_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_custom_order_id_custom_orders_id_fk" FOREIGN KEY ("custom_order_id") REFERENCES "public"."custom_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "productions_custom_order_id_uidx" ON "productions" ("custom_order_id") WHERE "custom_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_custom_order_id_uidx" ON "sales" ("custom_order_id") WHERE "custom_order_id" IS NOT NULL;

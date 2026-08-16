CREATE TYPE "public"."expense_category" AS ENUM('material', 'tool', 'electricity', 'rnd', 'other');--> statement-breakpoint
CREATE TYPE "public"."material_type" AS ENUM('filament', 'resin');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('rnd', 'active', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."sales_channel" AS ENUM('tokopedia', 'shopee', 'tiktok_shop', 'instagram', 'whatsapp', 'direct', 'other');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"electricity_rate_per_kwh" integer DEFAULT 1445 NOT NULL,
	"machine_usage_hours_per_month" integer DEFAULT 100 NOT NULL,
	"default_margin_percent" real DEFAULT 40 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"related_product_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"power_watt" integer DEFAULT 0 NOT NULL,
	"purchase_price" integer DEFAULT 0 NOT NULL,
	"purchase_date" date,
	"depreciation_months" integer DEFAULT 36 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "material_type" DEFAULT 'filament' NOT NULL,
	"unit" text DEFAULT 'gram' NOT NULL,
	"price_per_unit" integer DEFAULT 0 NOT NULL,
	"stock_quantity" real DEFAULT 0 NOT NULL,
	"supplier" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packaging" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"price_per_unit" integer DEFAULT 0 NOT NULL,
	"stock_quantity" real DEFAULT 0 NOT NULL,
	"supplier" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_packaging" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"packaging_id" integer NOT NULL,
	"quantity_used" real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"material_id" integer NOT NULL,
	"quantity_used" real DEFAULT 0 NOT NULL,
	"print_time_minutes" integer DEFAULT 0 NOT NULL,
	"machine_id" integer,
	"failure_rate_percent" real DEFAULT 5 NOT NULL,
	"labor_minutes" integer DEFAULT 0 NOT NULL,
	"labor_rate_per_hour" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'rnd' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sale_price_per_unit" integer DEFAULT 0 NOT NULL,
	"channel" "sales_channel" DEFAULT 'direct' NOT NULL,
	"marketplace_fee_percent" real,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_related_product_id_products_id_fk" FOREIGN KEY ("related_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_packaging" ADD CONSTRAINT "product_packaging_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_recipes" ADD CONSTRAINT "product_recipes_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

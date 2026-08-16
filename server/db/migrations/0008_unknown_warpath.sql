CREATE TYPE "public"."purchase_item_type" AS ENUM('material', 'packaging');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_purchase_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"item_type" "purchase_item_type" NOT NULL,
	"material_id" integer,
	"packaging_id" integer,
	"quantity" real DEFAULT 0 NOT NULL,
	"unit_price" integer DEFAULT 0 NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"supplier" text NOT NULL,
	"notes" text,
	"total_amount" integer DEFAULT 0 NOT NULL,
	"expense_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_purchase_lines" ADD CONSTRAINT "supplier_purchase_lines_purchase_id_supplier_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."supplier_purchases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_purchase_lines" ADD CONSTRAINT "supplier_purchase_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_purchase_lines" ADD CONSTRAINT "supplier_purchase_lines_packaging_id_packaging_id_fk" FOREIGN KEY ("packaging_id") REFERENCES "public"."packaging"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."order_status" AS ENUM('draft', 'confirmed', 'in_production', 'ready', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "date" date NOT NULL,
  "customer_name" text NOT NULL,
  "channel" "sales_channel" DEFAULT 'direct' NOT NULL,
  "status" "order_status" DEFAULT 'draft' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL,
  "product_id" integer NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "quantity_reserved" integer DEFAULT 0 NOT NULL,
  "price_per_unit" integer DEFAULT 0 NOT NULL,
  "hpp_per_unit" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "order_item_id" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "order_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "productions" ADD CONSTRAINT "productions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales" ADD CONSTRAINT "sales_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_order_id_uidx" ON "sales" USING btree ("order_id");

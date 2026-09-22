DO $$ BEGIN
  CREATE TYPE "product_kind" AS ENUM('normal', 'custom', 'collection');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "kind" "product_kind" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "slicer_jobs" ADD COLUMN IF NOT EXISTS "product_id" integer;--> statement-breakpoint
ALTER TABLE "slicer_jobs" ADD COLUMN IF NOT EXISTS "recipe_config" jsonb;--> statement-breakpoint
ALTER TABLE "slicer_jobs" ADD COLUMN IF NOT EXISTS "recipe_applied_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "slicer_jobs" ADD CONSTRAINT "slicer_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slicer_jobs_product_created_idx" ON "slicer_jobs" USING btree ("product_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_recipes_product_id_idx" ON "product_recipes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_packaging_product_id_idx" ON "product_packaging" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_files_product_id_idx" ON "product_files" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items" USING btree ("order_id");

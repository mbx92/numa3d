CREATE TABLE IF NOT EXISTS "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"object_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
INSERT INTO "product_images" ("product_id", "object_key", "sort_order")
SELECT "id", "image_key", 0 FROM "products"
WHERE "image_key" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "product_images" pi WHERE pi."product_id" = "products"."id" AND pi."object_key" = "products"."image_key"
  );

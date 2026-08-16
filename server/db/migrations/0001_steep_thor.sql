CREATE TABLE IF NOT EXISTS "product_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"filename" text NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"content_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_files" ADD CONSTRAINT "product_files_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Status draft: kumpulkan data produk sebelum diputuskan masuk R&D atau tidak.
ALTER TYPE "public"."product_status" ADD VALUE IF NOT EXISTS 'draft';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'draft';

-- Status draft: kumpulkan data produk sebelum diputuskan masuk R&D atau tidak.
-- Hanya ADD VALUE di migrasi ini. Pemakaian nilai baru (SET DEFAULT) di 0015
-- setelah transaksi ini di-commit — Postgres menolak memakai enum baru
-- dalam transaksi yang sama dengan ADD VALUE.
ALTER TYPE "public"."product_status" ADD VALUE IF NOT EXISTS 'draft';

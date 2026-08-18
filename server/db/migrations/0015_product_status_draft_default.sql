-- Default status produk baru = draft (setelah enum value di-commit di 0014).
ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'draft';

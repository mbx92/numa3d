-- Warna hex filament/resin/komponen (ganti upload gambar).
ALTER TABLE "materials" ADD COLUMN IF NOT EXISTS "color" text;

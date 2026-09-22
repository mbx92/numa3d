ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "slicer_enabled" boolean DEFAULT true NOT NULL;

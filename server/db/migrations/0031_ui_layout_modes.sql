ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "ui_layout_modes" jsonb NOT NULL DEFAULT '{"iphone":"preview-first","ipad":"stacked","macbook":"compact","desktop":"full"}'::jsonb;

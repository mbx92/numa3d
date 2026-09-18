ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "bed_width_mm" integer DEFAULT 220 NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "bed_depth_mm" integer DEFAULT 220 NOT NULL;--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN IF NOT EXISTS "build_height_mm" integer DEFAULT 250 NOT NULL;--> statement-breakpoint
UPDATE "machines"
SET "bed_width_mm" = 260, "bed_depth_mm" = 260, "build_height_mm" = 260
WHERE lower("name") LIKE '%kobra%x%'
  AND "bed_width_mm" = 220
  AND "bed_depth_mm" = 220
  AND "build_height_mm" = 250;

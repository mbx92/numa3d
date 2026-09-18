ALTER TABLE "slicer_jobs" ADD COLUMN IF NOT EXISTS "input_config" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_order_materials" (
  "id" serial PRIMARY KEY,
  "custom_order_id" integer NOT NULL REFERENCES "custom_orders"("id") ON DELETE CASCADE,
  "material_id" integer NOT NULL REFERENCES "materials"("id") ON DELETE RESTRICT,
  "quantity_used" real NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_order_materials_order_material_unique" ON "custom_order_materials" ("custom_order_id", "material_id");

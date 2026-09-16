CREATE TABLE "filament_types" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "filament_types_name_unique" ON "filament_types" (lower("name"));
--> statement-breakpoint
ALTER TABLE "materials" ADD COLUMN "filament_type_id" integer REFERENCES "filament_types"("id") ON DELETE RESTRICT;
--> statement-breakpoint
INSERT INTO "filament_types" ("name") VALUES ('PLA'), ('PETG'), ('ABS'), ('ASA'), ('TPU');

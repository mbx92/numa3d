CREATE TABLE IF NOT EXISTS "expense_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
INSERT INTO "expense_categories" ("key", "name", "is_system", "sort_order") VALUES
	('material', 'Material', true, 10),
	('packaging', 'Packaging', true, 20),
	('tool', 'Alat', true, 30),
	('electricity', 'Listrik', true, 40),
	('rnd', 'R&D', true, 50),
	('other', 'Lainnya', true, 90)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" SET DEFAULT 'other';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_expense_categories_key_fk" FOREIGN KEY ("category") REFERENCES "public"."expense_categories"("key") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DROP TYPE "public"."expense_category";

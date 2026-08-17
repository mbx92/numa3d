INSERT INTO "expense_categories" ("key", "name", "is_system", "sort_order") VALUES
	('machine', 'Mesin', true, 25)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "machines" ADD COLUMN "expense_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "machines" ADD CONSTRAINT "machines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

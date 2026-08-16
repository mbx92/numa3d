CREATE TABLE IF NOT EXISTS "expense_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"expense_id" integer NOT NULL,
	"product_id" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_products" ADD CONSTRAINT "expense_products_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expense_products" ADD CONSTRAINT "expense_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_products_expense_id_product_id_idx" ON "expense_products" USING btree ("expense_id","product_id");
--> statement-breakpoint
INSERT INTO "expense_products" ("expense_id", "product_id")
SELECT id, related_product_id FROM "expenses"
WHERE related_product_id IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "expense_products" ("expense_id", "product_id")
SELECT DISTINCT sp.expense_id, pr.product_id
FROM supplier_purchases sp
INNER JOIN supplier_purchase_lines spl ON spl.purchase_id = sp.id
INNER JOIN product_recipes pr ON pr.material_id = spl.material_id
WHERE sp.expense_id IS NOT NULL AND spl.item_type = 'material'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "expense_products" ("expense_id", "product_id")
SELECT DISTINCT sp.expense_id, pp.product_id
FROM supplier_purchases sp
INNER JOIN supplier_purchase_lines spl ON spl.purchase_id = sp.id
INNER JOIN product_packaging pp ON pp.packaging_id = spl.packaging_id
WHERE sp.expense_id IS NOT NULL AND spl.item_type = 'packaging'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE expenses e
SET related_product_id = ep.product_id
FROM (
  SELECT DISTINCT ON (expense_id) expense_id, product_id
  FROM expense_products
  ORDER BY expense_id, product_id
) ep
WHERE e.id = ep.expense_id AND e.related_product_id IS NULL;
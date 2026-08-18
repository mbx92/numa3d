-- Bersihkan karakter yang tampil sebagai kotak / U+FFFC di UI (desktop & mobile).
CREATE OR REPLACE FUNCTION sanitize_display_text(t text) RETURNS text AS $$
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  t := replace(t, chr(65532), ''); -- U+FFFC object replacement
  t := replace(t, chr(65533), ''); -- U+FFFD replacement
  t := replace(t, chr(183), '-'); -- U+00B7 middle dot
  t := replace(t, chr(8226), '-'); -- U+2022 bullet
  t := replace(t, chr(8230), '...'); -- U+2026 ellipsis
  t := replace(t, chr(160), ' '); -- U+00A0 nbsp
  t := replace(t, chr(8201), ' '); -- thin space
  t := replace(t, chr(8239), ' '); -- narrow nbsp
  t := regexp_replace(t, ' {2,}', ' ', 'g');
  RETURN trim(t);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

UPDATE "suppliers" SET "name" = sanitize_display_text("name"), "notes" = sanitize_display_text("notes");--> statement-breakpoint
UPDATE "supplier_purchases" SET "supplier" = sanitize_display_text("supplier"), "notes" = sanitize_display_text("notes");--> statement-breakpoint
UPDATE "materials" SET "name" = sanitize_display_text("name"), "unit" = sanitize_display_text("unit"), "supplier" = sanitize_display_text("supplier");--> statement-breakpoint
UPDATE "packaging" SET "name" = sanitize_display_text("name"), "unit" = sanitize_display_text("unit"), "supplier" = sanitize_display_text("supplier");--> statement-breakpoint
UPDATE "expenses" SET "description" = sanitize_display_text("description");--> statement-breakpoint

DROP FUNCTION IF EXISTS sanitize_display_text(text);

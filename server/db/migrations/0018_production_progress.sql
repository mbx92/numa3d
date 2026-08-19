ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "productions" ADD COLUMN IF NOT EXISTS "duration_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "productions"
SET "started_at" = "created_at"
WHERE "started_at" IS NULL AND "status" IN ('in_progress', 'done');

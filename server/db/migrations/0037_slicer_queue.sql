DO $$ BEGIN
  CREATE TYPE "slicer_job_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slicer_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "filename" text NOT NULL,
  "object_key" text NOT NULL,
  "tool" text NOT NULL,
  "include_profile" boolean DEFAULT true NOT NULL,
  "status" "slicer_job_status" DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "worker_id" text,
  "progress" integer DEFAULT 0 NOT NULL,
  "stage" text,
  "result" jsonb,
  "error" text,
  "cancel_requested" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "started_at" timestamp,
  "finished_at" timestamp,
  "heartbeat_at" timestamp,
  CONSTRAINT "slicer_jobs_object_key_unique" UNIQUE("object_key")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slicer_workers" (
  "id" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'starting' NOT NULL,
  "version" text,
  "current_job_id" integer,
  "message" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "slicer_jobs" ADD CONSTRAINT "slicer_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slicer_jobs_status_created_idx" ON "slicer_jobs" USING btree ("status", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slicer_jobs_user_created_idx" ON "slicer_jobs" USING btree ("user_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "slicer_workers_last_seen_idx" ON "slicer_workers" USING btree ("last_seen_at");

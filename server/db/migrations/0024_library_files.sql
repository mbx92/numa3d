CREATE TABLE IF NOT EXISTS "library_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"object_key" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"content_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

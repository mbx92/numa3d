CREATE TYPE "public"."capital_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "capital_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"type" "capital_type" DEFAULT 'deposit' NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);

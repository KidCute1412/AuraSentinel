CREATE TYPE "public"."job_status" AS ENUM('queued', 'prechecking', 'simulating', 'sending', 'confirmed', 'blocked', 'failed');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"intent" jsonb,
	"sim_result" jsonb,
	"explanation" jsonb,
	"reason_code" text,
	"tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"step" text NOT NULL,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_cursor" (
	"id" text PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chain_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"block_number" bigint NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"args" jsonb NOT NULL,
	"indexed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy" jsonb NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "jobs_created_at_idx" ON "jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_job_idx" ON "audit_log" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chain_events_tx_log_idx" ON "chain_events" USING btree ("tx_hash","log_index");
ALTER TABLE "jobs" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'queued'::text;--> statement-breakpoint
UPDATE "jobs" SET "status" = 'broadcasting' WHERE "status" = 'sending';--> statement-breakpoint
UPDATE "jobs" SET "status" = 'rejected' WHERE "status" = 'blocked';--> statement-breakpoint
DROP TYPE "public"."job_status";--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'prechecking', 'simulating', 'broadcasting', 'confirmed', 'rejected', 'reverted', 'failed');--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."job_status";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "status" SET DATA TYPE "public"."job_status" USING "status"::"public"."job_status";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "vault" text DEFAULT '0x0000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "precheck" jsonb;--> statement-breakpoint
CREATE INDEX "jobs_vault_created_at_idx" ON "jobs" USING btree ("vault","created_at");
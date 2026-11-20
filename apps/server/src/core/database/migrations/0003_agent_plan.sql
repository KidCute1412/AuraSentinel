ALTER TYPE "public"."job_status" ADD VALUE 'held';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "agent_plan" jsonb;
CREATE TABLE "vaults" (
	"safe" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"owner" text NOT NULL,
	"created_at_block" bigint NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "vaults_module_idx" ON "vaults" USING btree ("module");
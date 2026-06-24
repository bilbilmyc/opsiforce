CREATE TYPE "public"."project_transfer_kind" AS ENUM('export', 'import');--> statement-breakpoint
CREATE TYPE "public"."project_transfer_status" AS ENUM('queued', 'committing', 'staging', 'archiving', 'unpacking', 'starting', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "project_transfer_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "project_transfer_kind" NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" "project_transfer_status" DEFAULT 'queued' NOT NULL,
	"bytes_total" bigint DEFAULT 0 NOT NULL,
	"bytes_processed" bigint DEFAULT 0 NOT NULL,
	"file_name" text,
	"file_size" bigint,
	"agent_fallback_from" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_transfer_jobs" ADD CONSTRAINT "project_transfer_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_transfer_jobs_project" ON "project_transfer_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_transfer_jobs_status" ON "project_transfer_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_transfer_jobs_kind" ON "project_transfer_jobs" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_transfer_jobs_one_active" ON "project_transfer_jobs" USING btree ("kind","project_id") WHERE "project_transfer_jobs"."status" not in ('completed', 'failed');
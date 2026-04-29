CREATE TYPE "public"."project_duplicate_status" AS ENUM('queued', 'copying', 'starting', 'completed', 'failed');
--> statement-breakpoint
CREATE TABLE "project_duplicate_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_project_id" text NOT NULL,
	"target_project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" "project_duplicate_status" DEFAULT 'queued' NOT NULL,
	"bytes_total" bigint DEFAULT 0 NOT NULL,
	"bytes_copied" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_duplicate_jobs_target_unique" UNIQUE("target_project_id")
);
--> statement-breakpoint
ALTER TABLE "project_duplicate_jobs" ADD CONSTRAINT "project_duplicate_jobs_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_project_duplicate_jobs_source" ON "project_duplicate_jobs" USING btree ("source_project_id");
--> statement-breakpoint
CREATE INDEX "idx_project_duplicate_jobs_status" ON "project_duplicate_jobs" USING btree ("status");

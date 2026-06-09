CREATE TYPE "public"."project_publish_status" AS ENUM('queued', 'committing', 'building', 'migrating', 'swapping', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "deleted_project_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text,
	"directory" text NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "environments_tenant_id_name_unique" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "project_environments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"environment_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"directory" text NOT NULL,
	"status" "project_status" DEFAULT 'starting' NOT NULL,
	"pod_ip" text,
	"session_id" text,
	"platform_version" text NOT NULL,
	"auth_mode" "project_auth_mode" DEFAULT 'public' NOT NULL,
	"deployed_commit_sha" text,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_environments_project_id_environment_id_unique" UNIQUE("project_id","environment_id")
);
--> statement-breakpoint
CREATE TABLE "project_publish_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"project_environment_id" text NOT NULL,
	"environment_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"status" "project_publish_status" DEFAULT 'queued' NOT NULL,
	"commit_sha" text,
	"previous_commit_sha" text,
	"error" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_pool_tenant_null";--> statement-breakpoint
ALTER TABLE "gateway_audit_logs" ADD COLUMN "project_environment_id" text;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD COLUMN "project_environment_id" text;--> statement-breakpoint
ALTER TABLE "project_app" ADD COLUMN "pinned_environment_id" text;--> statement-breakpoint
ALTER TABLE "project_gateway_keys" ADD COLUMN "project_environment_id" text;--> statement-breakpoint
ALTER TABLE "project_schedules" ADD COLUMN "project_environment_id" text;--> statement-breakpoint
ALTER TABLE "project_virtual_keys" ADD COLUMN "project_environment_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_environments" ADD CONSTRAINT "project_environments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_publish_jobs" ADD CONSTRAINT "project_publish_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_publish_jobs" ADD CONSTRAINT "project_publish_jobs_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_publish_jobs" ADD CONSTRAINT "project_publish_jobs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "environments_one_default_per_tenant" ON "environments" USING btree ("tenant_id") WHERE "environments"."is_default";--> statement-breakpoint
CREATE INDEX "idx_project_environments_project" ON "project_environments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_environments_status" ON "project_environments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_publish_jobs_project" ON "project_publish_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_publish_jobs_environment" ON "project_publish_jobs" USING btree ("project_environment_id");--> statement-breakpoint
CREATE INDEX "idx_project_publish_jobs_status" ON "project_publish_jobs" USING btree ("status");--> statement-breakpoint
ALTER TABLE "gateway_audit_logs" ADD CONSTRAINT "gateway_audit_logs_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD CONSTRAINT "project_agent_updates_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_app" ADD CONSTRAINT "project_app_pinned_environment_id_project_environments_id_fk" FOREIGN KEY ("pinned_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_gateway_keys" ADD CONSTRAINT "project_gateway_keys_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedules" ADD CONSTRAINT "project_schedules_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_virtual_keys" ADD CONSTRAINT "project_virtual_keys_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_pool_tenant_null" CHECK (("projects"."status"::text = 'pending' AND "projects"."tenant_id" IS NULL) OR ("projects"."status"::text <> 'pending' AND "projects"."tenant_id" IS NOT NULL));--> statement-breakpoint
INSERT INTO "environments" ("id", "tenant_id", "name", "description", "is_default")
SELECT gen_random_uuid()::text, t."id", 'Development', 'Default working environment', true
FROM "tenants" t;--> statement-breakpoint
INSERT INTO "project_environments" (
	"id", "project_id", "environment_id", "is_default", "directory",
	"status", "pod_ip", "session_id", "platform_version", "auth_mode",
	"deployed_commit_sha", "last_active_at", "created_at", "updated_at"
)
SELECT
	p."id", p."id", e."id", true, p."directory",
	p."status", p."pod_ip", p."session_id", p."platform_version",
	COALESCE(ps."auth_mode", 'public'::"project_auth_mode"),
	NULL, p."last_active_at", p."created_at", p."updated_at"
FROM "projects" p
LEFT JOIN "project_settings" ps ON ps."project_id" = p."id"
LEFT JOIN "environments" e ON e."tenant_id" = p."tenant_id" AND e."is_default" = true;--> statement-breakpoint
UPDATE "projects" SET "disabled" = true WHERE "status"::text = 'disabled';--> statement-breakpoint
UPDATE "project_app" SET "pinned_environment_id" = "project_id" WHERE "is_pinned" = true AND "pinned_environment_id" IS NULL;--> statement-breakpoint
UPDATE "project_virtual_keys" SET "project_environment_id" = "project_id" WHERE "project_environment_id" IS NULL;--> statement-breakpoint
UPDATE "project_gateway_keys" SET "project_environment_id" = "project_id" WHERE "project_environment_id" IS NULL;--> statement-breakpoint
UPDATE "project_schedules" SET "project_environment_id" = "project_id" WHERE "project_environment_id" IS NULL;--> statement-breakpoint
UPDATE "project_agent_updates" SET "project_environment_id" = "project_id" WHERE "project_environment_id" IS NULL;--> statement-breakpoint
UPDATE "gateway_audit_logs" SET "project_environment_id" = "project_id" WHERE "project_environment_id" IS NULL;
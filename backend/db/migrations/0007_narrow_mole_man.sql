CREATE TABLE "project_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"timeout_idle" bigint NOT NULL,
	"app_timeout_idle" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "project_settings" (
	"project_id",
	"timeout_idle",
	"app_timeout_idle"
)
SELECT
	"id",
	COALESCE("timeout_idle_minutes", 30) * 60000,
	COALESCE("app_timeout_idle_minutes", 10080) * 60000
FROM "projects";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "timeout_idle_minutes";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "app_timeout_idle_minutes";

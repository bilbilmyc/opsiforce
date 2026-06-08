CREATE TYPE "public"."pod_class" AS ENUM('small', 'medium', 'large', 'custom');--> statement-breakpoint
CREATE TABLE "project_pod_settings" (
	"project_id" text PRIMARY KEY NOT NULL,
	"pod_class" "pod_class" DEFAULT 'small' NOT NULL,
	"cpu_millicores" integer NOT NULL,
	"memory_request_mib" integer NOT NULL,
	"memory_limit_mib" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_pod_settings" ADD CONSTRAINT "project_pod_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "project_pod_settings" ("project_id", "pod_class", "cpu_millicores", "memory_request_mib", "memory_limit_mib")
SELECT "id", 'small', 500, 2048, 4096 FROM "projects"
ON CONFLICT ("project_id") DO NOTHING;
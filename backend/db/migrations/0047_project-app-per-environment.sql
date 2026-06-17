CREATE TABLE "project_app_new" (
	"project_environment_id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text,
	"description" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_by_id" text,
	"pinned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "project_app_new" ("project_environment_id", "project_id", "name", "description", "is_pinned", "pinned_by_id", "pinned_at", "created_at", "updated_at")
SELECT
	pe."id",
	pa."project_id",
	pa."name",
	pa."description",
	(pa."is_pinned" AND pe."id" = coalesce(pa."pinned_environment_id", pa."project_id")),
	CASE WHEN pa."is_pinned" AND pe."id" = coalesce(pa."pinned_environment_id", pa."project_id") THEN pa."pinned_by_id" END,
	CASE WHEN pa."is_pinned" AND pe."id" = coalesce(pa."pinned_environment_id", pa."project_id") THEN pa."pinned_at" END,
	pa."created_at",
	pa."updated_at"
FROM "project_app" pa
JOIN "project_environments" pe
	ON pe."project_id" = pa."project_id"
	AND (pe."id" = pa."project_id" OR pe."deployed_commit_sha" IS NOT NULL OR pe."id" = coalesce(pa."pinned_environment_id", pa."project_id"));
--> statement-breakpoint
DROP TABLE "project_app";--> statement-breakpoint
ALTER TABLE "project_app_new" RENAME TO "project_app";--> statement-breakpoint
ALTER TABLE "project_app" ADD CONSTRAINT "project_app_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_app" ADD CONSTRAINT "project_app_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_app" ADD CONSTRAINT "project_app_pinned_by_id_users_id_fk" FOREIGN KEY ("pinned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_app_project" ON "project_app" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_app_pinned" ON "project_app" USING btree ("is_pinned","pinned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_app_one_pin_per_project" ON "project_app" USING btree ("project_id") WHERE "project_app"."is_pinned";

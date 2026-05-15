CREATE TABLE "project_app" (
	"project_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"description" text,
	"icon_url" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"pinned_by_id" text,
	"pinned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_app" ADD CONSTRAINT "project_app_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_app" ADD CONSTRAINT "project_app_pinned_by_id_users_id_fk" FOREIGN KEY ("pinned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_app_pinned" ON "project_app" USING btree ("is_pinned","pinned_at");

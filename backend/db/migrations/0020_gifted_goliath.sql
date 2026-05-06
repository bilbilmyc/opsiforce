CREATE TYPE "public"."agent_migration_status" AS ENUM('queued', 'running', 'applied', 'skipped', 'conflict', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_update_status" AS ENUM('queued', 'running', 'reload_pending', 'applied', 'conflict', 'failed');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "agents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
INSERT INTO "agents" ("id", "name") VALUES ('app-builder', 'app-builder') ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE "project_agent_migrations" (
	"id" text PRIMARY KEY NOT NULL,
	"update_id" text NOT NULL,
	"project_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"migration_id" text NOT NULL,
	"target_version" text NOT NULL,
	"status" "agent_migration_status" DEFAULT 'queued' NOT NULL,
	"path" text,
	"reason" text,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_agent_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"from_version" text,
	"target_version" text NOT NULL,
	"agent_owned_hash" text,
	"status" "agent_update_status" DEFAULT 'queued' NOT NULL,
	"requires_open_code_reload" boolean DEFAULT false NOT NULL,
	"requires_app_restart" boolean DEFAULT false NOT NULL,
	"requires_pod_recreate" boolean DEFAULT false NOT NULL,
	"reload_status" text,
	"error" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_agent_migrations" ADD CONSTRAINT "project_agent_migrations_update_id_project_agent_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."project_agent_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_migrations" ADD CONSTRAINT "project_agent_migrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_migrations" ADD CONSTRAINT "project_agent_migrations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD CONSTRAINT "project_agent_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD CONSTRAINT "project_agent_updates_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_agent_migrations_update" ON "project_agent_migrations" USING btree ("update_id");--> statement-breakpoint
CREATE INDEX "idx_project_agent_migrations_project" ON "project_agent_migrations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_agent_migrations_status" ON "project_agent_migrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_agent_migrations_migration" ON "project_agent_migrations" USING btree ("migration_id");--> statement-breakpoint
CREATE INDEX "idx_project_agent_updates_project" ON "project_agent_updates" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_agent_updates_agent" ON "project_agent_updates" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "idx_project_agent_updates_status" ON "project_agent_updates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_agent_updates_project_agent" ON "project_agent_updates" USING btree ("project_id","agent_id");

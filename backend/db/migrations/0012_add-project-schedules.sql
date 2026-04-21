CREATE TABLE "project_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"cron_pattern" text NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"target_path" text NOT NULL,
	"method" text DEFAULT 'POST' NOT NULL,
	"body" jsonb,
	"headers" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_schedules_project_id_name_unique" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "schedule_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"trigger" text DEFAULT 'cron' NOT NULL,
	"fired_at" timestamp DEFAULT now() NOT NULL,
	"status_code" integer,
	"latency_ms" bigint,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "project_schedules" ADD CONSTRAINT "project_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedules" ADD CONSTRAINT "project_schedules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_executions" ADD CONSTRAINT "schedule_executions_schedule_id_project_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."project_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_executions_schedule_id_fired_at_idx" ON "schedule_executions" USING btree ("schedule_id","fired_at");
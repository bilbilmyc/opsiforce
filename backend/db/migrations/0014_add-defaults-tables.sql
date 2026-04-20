CREATE TABLE "global_agent_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"default_model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_budget_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"default_tenant_budget" bigint NOT NULL,
	"default_tenant_budget_duration" text NOT NULL,
	"default_project_budget" bigint NOT NULL,
	"default_project_budget_duration" text NOT NULL,
	"default_chat_budget" bigint NOT NULL,
	"default_chat_budget_duration" text NOT NULL,
	"default_backend_budget" bigint NOT NULL,
	"default_backend_budget_duration" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_timeout_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"default_timeout_idle" bigint NOT NULL,
	"default_app_timeout_idle" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_agent_defaults" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"default_model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_budget_defaults" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"default_tenant_budget" bigint NOT NULL,
	"default_tenant_budget_duration" text NOT NULL,
	"default_project_budget" bigint NOT NULL,
	"default_project_budget_duration" text NOT NULL,
	"default_chat_budget" bigint NOT NULL,
	"default_chat_budget_duration" text NOT NULL,
	"default_backend_budget" bigint NOT NULL,
	"default_backend_budget_duration" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_timeout_defaults" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"default_timeout_idle" bigint NOT NULL,
	"default_app_timeout_idle" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_agent_defaults" ADD CONSTRAINT "tenant_agent_defaults_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_budget_defaults" ADD CONSTRAINT "tenant_budget_defaults_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_timeout_defaults" ADD CONSTRAINT "tenant_timeout_defaults_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "global_timeout_defaults" ("id", "default_timeout_idle", "default_app_timeout_idle")
VALUES ('default', 1800000, 604800000);--> statement-breakpoint
INSERT INTO "global_budget_defaults" (
  "id",
  "default_tenant_budget", "default_tenant_budget_duration",
  "default_project_budget", "default_project_budget_duration",
  "default_chat_budget", "default_chat_budget_duration",
  "default_backend_budget", "default_backend_budget_duration"
) VALUES (
  'default',
  100, '1M',
  10, '1M',
  5, '1M',
  5, '1M'
);--> statement-breakpoint
INSERT INTO "global_agent_defaults" ("id", "default_model")
VALUES ('default', 'openai/gpt-5.4');--> statement-breakpoint
INSERT INTO "tenant_timeout_defaults" ("tenant_id", "default_timeout_idle", "default_app_timeout_idle")
SELECT t."id", g."default_timeout_idle", g."default_app_timeout_idle"
FROM "tenants" t CROSS JOIN "global_timeout_defaults" g
WHERE g."id" = 'default';--> statement-breakpoint
INSERT INTO "tenant_budget_defaults" (
  "tenant_id",
  "default_tenant_budget", "default_tenant_budget_duration",
  "default_project_budget", "default_project_budget_duration",
  "default_chat_budget", "default_chat_budget_duration",
  "default_backend_budget", "default_backend_budget_duration"
)
SELECT
  t."id",
  g."default_tenant_budget", g."default_tenant_budget_duration",
  g."default_project_budget", g."default_project_budget_duration",
  g."default_chat_budget", g."default_chat_budget_duration",
  g."default_backend_budget", g."default_backend_budget_duration"
FROM "tenants" t CROSS JOIN "global_budget_defaults" g
WHERE g."id" = 'default';--> statement-breakpoint
INSERT INTO "tenant_agent_defaults" ("tenant_id", "default_model")
SELECT t."id", g."default_model"
FROM "tenants" t CROSS JOIN "global_agent_defaults" g
WHERE g."id" = 'default';
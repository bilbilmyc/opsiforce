CREATE TABLE "external_service_config" (
	"service" text NOT NULL,
	"project_environment_id" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_service_config_service_project_environment_id_pk" PRIMARY KEY("service","project_environment_id")
);
--> statement-breakpoint
CREATE TABLE "external_service_resource" (
	"service" text NOT NULL,
	"resource_key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_service_resource_service_resource_key_pk" PRIMARY KEY("service","resource_key")
);
--> statement-breakpoint
CREATE TABLE "external_service_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"project_environment_id" text,
	"service" text NOT NULL,
	"month" date NOT NULL,
	"count" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_service_usage_bucket_unique" UNIQUE("tenant_id","project_id","project_environment_id","service","month")
);
--> statement-breakpoint
ALTER TABLE "external_service_config" ADD CONSTRAINT "external_service_config_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_service_usage" ADD CONSTRAINT "external_service_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_service_usage" ADD CONSTRAINT "external_service_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_service_usage" ADD CONSTRAINT "external_service_usage_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_external_service_usage_month" ON "external_service_usage" USING btree ("month");--> statement-breakpoint
CREATE INDEX "idx_external_service_usage_tenant_month" ON "external_service_usage" USING btree ("tenant_id","month");
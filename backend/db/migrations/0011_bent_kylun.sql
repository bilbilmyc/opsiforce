CREATE TABLE "gateway_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"service" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" bigint,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_gateway_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_gateway_keys_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "gateway_audit_logs" ADD CONSTRAINT "gateway_audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gateway_audit_logs" ADD CONSTRAINT "gateway_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_gateway_keys" ADD CONSTRAINT "project_gateway_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_gateway_keys" ADD CONSTRAINT "project_gateway_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
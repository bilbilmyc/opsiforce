ALTER TABLE "project_api_keys" RENAME TO "project_virtual_keys";--> statement-breakpoint
ALTER TABLE "project_virtual_keys" DROP CONSTRAINT "project_api_keys_project_id_projects_id_fk";--> statement-breakpoint
ALTER TABLE "project_virtual_keys" DROP CONSTRAINT "project_api_keys_tenant_id_tenants_id_fk";--> statement-breakpoint
ALTER TABLE "project_virtual_keys" ADD CONSTRAINT "project_virtual_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_virtual_keys" ADD CONSTRAINT "project_virtual_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_virtual_keys" DROP COLUMN IF EXISTS "max_budget";--> statement-breakpoint
ALTER TABLE "project_virtual_keys" DROP COLUMN IF EXISTS "budget_duration";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "bifrost_tenant_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "bifrost_project_id" text;

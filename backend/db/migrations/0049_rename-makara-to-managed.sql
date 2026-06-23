ALTER TYPE "public"."project_auth_mode" RENAME VALUE 'makara' TO 'managed';--> statement-breakpoint
ALTER TABLE "tenant_settings" RENAME COLUMN "makara_tenant_name" TO "external_tenant_name";--> statement-breakpoint
ALTER TABLE "tenant_settings" RENAME CONSTRAINT "tenant_settings_makara_tenant_name_unique" TO "tenant_settings_external_tenant_name_unique";
ALTER TABLE "projects" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_virtual_keys" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_gateway_keys" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_pool_tenant_null" CHECK ((status::text = 'pending' AND tenant_id IS NULL) OR (status::text <> 'pending' AND tenant_id IS NOT NULL));

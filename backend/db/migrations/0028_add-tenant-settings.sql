CREATE TABLE "tenant_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"makara_tenant_name" text,
	CONSTRAINT "tenant_settings_makara_tenant_name_unique" UNIQUE("makara_tenant_name")
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "tenant_settings" ("tenant_id", "makara_tenant_name")
SELECT "id", "name" FROM "tenants"
ON CONFLICT ("tenant_id") DO NOTHING;
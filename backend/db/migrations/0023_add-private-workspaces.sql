CREATE TYPE "public"."workspace_type" AS ENUM('private', 'shared');--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "type" "workspace_type" DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_one_private_per_user_per_tenant" ON "workspaces" USING btree ("tenant_id","owner_id") WHERE "workspaces"."owner_id" is not null;--> statement-breakpoint
INSERT INTO "workspaces" ("id", "tenant_id", "type", "owner_id", "name", "description", "created_at", "updated_at")
SELECT gen_random_uuid()::text, ut."tenant_id", 'private', ut."user_id", 'Personal', NULL, now(), now()
FROM "user_tenants" ut
ON CONFLICT ("tenant_id", "owner_id") WHERE "owner_id" is not null DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "added_at")
SELECT w."id", w."owner_id", now()
FROM "workspaces" w
WHERE w."type" = 'private' AND w."owner_id" IS NOT NULL
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;

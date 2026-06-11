ALTER TABLE "environments" ADD COLUMN "is_protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "environments" SET "is_protected" = true WHERE "is_default" = true OR lower("name") = 'production';--> statement-breakpoint
INSERT INTO "environments" ("id", "tenant_id", "name", "description", "is_default", "is_protected")
SELECT gen_random_uuid()::text, t."id", 'Production', 'Live environment for published apps', false, true
FROM "tenants" t
WHERE NOT EXISTS (
  SELECT 1 FROM "environments" e WHERE e."tenant_id" = t."id" AND lower(e."name") = 'production'
);

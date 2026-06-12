ALTER TABLE "environments" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "environments" SET "slug" = 'dev' WHERE "is_default" = true;--> statement-breakpoint
UPDATE "environments" SET "slug" = 'prod' WHERE "is_protected" = true AND "is_default" = false;--> statement-breakpoint
DO $$
DECLARE
  env RECORD;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR env IN
    SELECT "id", "tenant_id", "name"
    FROM "environments"
    WHERE "slug" IS NULL
    ORDER BY "tenant_id", "created_at", "id"
  LOOP
    base := coalesce(
      nullif(trim(both '-' from substring(regexp_replace(lower(env."name"), '[^a-z0-9]+', '-', 'g') for 26)), ''),
      'environment'
    );
    candidate := base;
    suffix := 1;
    WHILE EXISTS (
      SELECT 1 FROM "environments" taken
      WHERE taken."tenant_id" = env."tenant_id" AND taken."slug" = candidate
    ) LOOP
      suffix := suffix + 1;
      candidate := trim(both '-' from substring(base for 25 - length(suffix::text))) || '-' || suffix;
    END LOOP;
    UPDATE "environments" SET "slug" = candidate WHERE "id" = env."id";
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_tenant_id_slug_unique" UNIQUE("tenant_id","slug");

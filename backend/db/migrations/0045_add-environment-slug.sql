ALTER TABLE "environments" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "environments" SET "slug" = 'dev' WHERE "is_default" = true;--> statement-breakpoint
UPDATE "environments" SET "slug" = 'prod' WHERE "is_protected" = true AND "is_default" = false;--> statement-breakpoint
WITH custom AS (
  SELECT
    "id",
    "tenant_id",
    coalesce(
      nullif(trim(both '-' from substring(regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g') for 26)), ''),
      'environment'
    ) AS base,
    "created_at"
  FROM "environments"
  WHERE "slug" IS NULL
),
numbered AS (
  SELECT
    "id",
    base,
    row_number() OVER (PARTITION BY "tenant_id", base ORDER BY "created_at", "id")
      + CASE WHEN base IN ('dev', 'prod') THEN 1 ELSE 0 END AS rn
  FROM custom
)
UPDATE "environments" e
SET "slug" = CASE
  WHEN n.rn = 1 THEN n.base
  ELSE trim(both '-' from substring(n.base for 23)) || '-' || n.rn
END
FROM numbered n
WHERE e."id" = n."id";--> statement-breakpoint
ALTER TABLE "environments" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_tenant_id_slug_unique" UNIQUE("tenant_id","slug");

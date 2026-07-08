ALTER TABLE "environments" ADD COLUMN "color" text DEFAULT '#3B82F6' NOT NULL;--> statement-breakpoint
UPDATE "environments" SET "color" = '#3B82F6' WHERE "is_default" = true;--> statement-breakpoint
UPDATE "environments" SET "color" = '#22C55E' WHERE "is_default" = false AND lower("name") = 'production';--> statement-breakpoint
UPDATE "environments" AS e
SET "color" = palette.hex
FROM (
  SELECT
    ranked."id",
    (ARRAY['#F97316','#A855F7','#EC4899','#14B8A6','#EAB308','#EF4444','#6366F1','#06B6D4'])[((ranked.rn - 1) % 8) + 1] AS hex
  FROM (
    SELECT
      "id",
      row_number() OVER (PARTITION BY "tenant_id" ORDER BY "created_at", "id") AS rn
    FROM "environments"
    WHERE "is_default" = false AND lower("name") <> 'production'
  ) ranked
) palette
WHERE e."id" = palette."id";

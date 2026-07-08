ALTER TABLE "projects" ADD COLUMN "last_prompt_at" timestamp;--> statement-breakpoint
UPDATE "projects" SET "last_prompt_at" = "pe"."last_active_at"
FROM "project_environments" "pe"
WHERE "pe"."project_id" = "projects"."id"
  AND "pe"."is_default" = true
  AND "pe"."last_active_at" IS NOT NULL;

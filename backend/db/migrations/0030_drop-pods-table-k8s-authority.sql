DROP TABLE IF EXISTS "pods" CASCADE;--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN IF EXISTS "pod_name";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."pod_status";

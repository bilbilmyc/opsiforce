DROP TABLE "project_agent_migrations";--> statement-breakpoint
DROP TYPE "public"."agent_migration_status";--> statement-breakpoint
ALTER TABLE "project_agent_updates" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."agent_update_status" RENAME TO "agent_update_status_old";--> statement-breakpoint
CREATE TYPE "public"."agent_update_status" AS ENUM('running', 'reload_pending', 'applied', 'conflict', 'failed');--> statement-breakpoint
ALTER TABLE "project_agent_updates" ALTER COLUMN "status" TYPE "public"."agent_update_status" USING (CASE WHEN "status"::text = 'queued' THEN 'running' ELSE "status"::text END)::"public"."agent_update_status";--> statement-breakpoint
ALTER TABLE "project_agent_updates" ALTER COLUMN "status" SET DEFAULT 'running';--> statement-breakpoint
DROP TYPE "public"."agent_update_status_old";--> statement-breakpoint
ALTER TABLE "project_agent_updates" DROP COLUMN "agent_owned_hash";--> statement-breakpoint
ALTER TABLE "project_agent_updates" DROP COLUMN "requires_app_restart";--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD COLUMN "reload_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD COLUMN "applied_migrations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD COLUMN "skipped_migrations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD COLUMN "conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_agent_updates" ADD COLUMN "failed_migrations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
DROP INDEX "idx_project_agent_updates_agent";

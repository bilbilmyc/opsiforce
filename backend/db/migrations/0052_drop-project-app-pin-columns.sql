ALTER TABLE "project_app" DROP CONSTRAINT "project_app_pinned_by_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_project_app_pinned";--> statement-breakpoint
DROP INDEX "uq_project_app_one_pin_per_project";--> statement-breakpoint
ALTER TABLE "project_app" DROP COLUMN "is_pinned";--> statement-breakpoint
ALTER TABLE "project_app" DROP COLUMN "pinned_by_id";--> statement-breakpoint
ALTER TABLE "project_app" DROP COLUMN "pinned_at";
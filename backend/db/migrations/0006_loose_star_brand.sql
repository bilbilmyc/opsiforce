ALTER TABLE "projects" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'starting'::text;--> statement-breakpoint
UPDATE "projects" SET "status" = 'starting' WHERE "status" = 'pending';--> statement-breakpoint
UPDATE "projects" SET "status" = 'suspended' WHERE "status" = 'stopped';--> statement-breakpoint
DROP TYPE "public"."project_status";--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('starting', 'active', 'suspended');--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'starting'::"public"."project_status";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "status" SET DATA TYPE "public"."project_status" USING "status"::"public"."project_status";

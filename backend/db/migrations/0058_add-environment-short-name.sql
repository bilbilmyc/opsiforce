ALTER TABLE "environments" ADD COLUMN "short_name" text;--> statement-breakpoint
UPDATE "environments" SET "short_name" = 'DEV' WHERE "slug" IN ('dev', 'development');--> statement-breakpoint
UPDATE "environments" SET "short_name" = 'PROD' WHERE "slug" IN ('prod', 'production');--> statement-breakpoint
UPDATE "environments" SET "short_name" = 'STG' WHERE "slug" IN ('stage', 'staging');--> statement-breakpoint
UPDATE "environments" SET "short_name" = 'TST' WHERE "slug" IN ('test', 'testing');--> statement-breakpoint
UPDATE "environments" SET "short_name" = 'QA' WHERE "slug" = 'qa';--> statement-breakpoint
UPDATE "environments" SET "short_name" = 'UAT' WHERE "slug" = 'uat';

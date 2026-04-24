CREATE TYPE "public"."project_auth_mode" AS ENUM('public', 'manual');--> statement-breakpoint
ALTER TABLE "project_settings" ADD COLUMN "auth_mode" "project_auth_mode" DEFAULT 'public' NOT NULL;
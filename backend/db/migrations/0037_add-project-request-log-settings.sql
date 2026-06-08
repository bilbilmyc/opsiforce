CREATE TYPE "public"."request_log_mode" AS ENUM('off', 'metadata', 'full');--> statement-breakpoint
ALTER TABLE "project_settings" ADD COLUMN "request_log_mode" "request_log_mode" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_settings" ADD COLUMN "request_log_body_limit" integer DEFAULT 10240 NOT NULL;
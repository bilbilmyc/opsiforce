CREATE TYPE "public"."key_type" AS ENUM('chat', 'backend');--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "key_type" "key_type" DEFAULT 'chat' NOT NULL;
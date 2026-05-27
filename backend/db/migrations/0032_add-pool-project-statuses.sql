ALTER TYPE "public"."project_status" ADD VALUE IF NOT EXISTS 'pending';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE IF NOT EXISTS 'claiming';

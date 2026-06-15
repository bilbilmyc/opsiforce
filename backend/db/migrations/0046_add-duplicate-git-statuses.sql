ALTER TYPE "public"."project_duplicate_status" ADD VALUE 'committing' BEFORE 'copying';--> statement-breakpoint
ALTER TYPE "public"."project_duplicate_status" ADD VALUE 'cloning' BEFORE 'copying';
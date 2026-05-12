ALTER TABLE "agents" ADD COLUMN "display_name" text;--> statement-breakpoint
UPDATE "agents" SET "display_name" = 'App Builder' WHERE "name" = 'app-builder';

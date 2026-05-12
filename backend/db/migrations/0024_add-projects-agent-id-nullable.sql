ALTER TABLE "projects" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "agents" ("id", "name") VALUES (gen_random_uuid()::text, 'app-builder') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
UPDATE "projects" SET "agent_id" = (SELECT "id" FROM "agents" WHERE "name" = 'app-builder' LIMIT 1) WHERE "agent_id" IS NULL;

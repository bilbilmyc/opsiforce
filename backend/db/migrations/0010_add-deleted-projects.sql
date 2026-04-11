CREATE TABLE "deleted_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"directory" text NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL
);

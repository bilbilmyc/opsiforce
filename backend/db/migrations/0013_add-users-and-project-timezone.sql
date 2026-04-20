CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"keycloak_id" text NOT NULL,
	"email" text,
	"display_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_keycloak_id_unique" UNIQUE("keycloak_id")
);
--> statement-breakpoint
ALTER TABLE "project_settings" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;
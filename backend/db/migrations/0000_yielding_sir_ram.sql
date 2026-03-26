CREATE TYPE "public"."pod_status" AS ENUM('warm', 'assigned', 'terminating');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('pending', 'starting', 'active', 'suspended', 'stopped');--> statement-breakpoint
CREATE TABLE "pods" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_name" text NOT NULL,
	"status" "pod_status" DEFAULT 'warm' NOT NULL,
	"project_id" text,
	"pod_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pods_pod_name_unique" UNIQUE("pod_name")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"description" text,
	"directory" text NOT NULL,
	"status" "project_status" DEFAULT 'pending' NOT NULL,
	"pod_name" text,
	"pod_ip" text,
	"session_id" text,
	"platform_version" text NOT NULL,
	"last_active_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pods" ADD CONSTRAINT "pods_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
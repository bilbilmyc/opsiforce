CREATE TABLE "incoming_email_addresses" (
	"project_environment_id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "incoming_email_addresses_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "incoming_email_addresses" ADD CONSTRAINT "incoming_email_addresses_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;
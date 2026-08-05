CREATE TABLE "whapi_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"api_token" text NOT NULL,
	"webhook_secret" text NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whapi_channels_channel_id_tenant_id_unique" UNIQUE("channel_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "whapi_chat_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"whapi_channel_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"project_environment_id" text NOT NULL,
	"chat_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whapi_chat_routes_channel_chat_environment_unique" UNIQUE("whapi_channel_id","chat_id","project_environment_id")
);
--> statement-breakpoint
ALTER TABLE "whapi_channels" ADD CONSTRAINT "whapi_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whapi_chat_routes" ADD CONSTRAINT "whapi_chat_routes_whapi_channel_id_whapi_channels_id_fk" FOREIGN KEY ("whapi_channel_id") REFERENCES "public"."whapi_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whapi_chat_routes" ADD CONSTRAINT "whapi_chat_routes_project_environment_id_project_environments_id_fk" FOREIGN KEY ("project_environment_id") REFERENCES "public"."project_environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_whapi_channels_channel" ON "whapi_channels" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_whapi_channels_tenant" ON "whapi_channels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_whapi_chat_routes_chat" ON "whapi_chat_routes" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "idx_whapi_chat_routes_environment" ON "whapi_chat_routes" USING btree ("project_environment_id");
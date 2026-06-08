CREATE INDEX "idx_project_environments_environment" ON "project_environments" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "idx_project_gateway_keys_environment" ON "project_gateway_keys" USING btree ("project_environment_id");--> statement-breakpoint
CREATE INDEX "idx_project_virtual_keys_environment" ON "project_virtual_keys" USING btree ("project_environment_id");
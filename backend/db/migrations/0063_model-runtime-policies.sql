CREATE TABLE "model_runtime_policies" (
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "policy" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("provider", "model")
);
--> statement-breakpoint
-- Retain the original table for rollback. Never read its capability overrides at runtime.
INSERT INTO "model_runtime_policies" (provider, model, policy, updated_at)
SELECT provider, model, jsonb_strip_nulls(jsonb_build_object(
  'outputBudget', policy->'outputBudget',
  'reasoningEffort', policy->'reasoningEffort',
  'reasoningBudget', policy->'reasoningBudget'
)), updated_at FROM "model_capability_profiles";

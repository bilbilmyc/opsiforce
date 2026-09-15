CREATE TABLE "model_capability_profiles" (
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "policy" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("provider", "model")
);

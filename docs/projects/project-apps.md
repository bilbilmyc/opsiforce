# Project Apps

> The per-environment identity of the apps a project builds — their name/description, how one is pinned into the app catalog, and how humans curate that identity. Read this to understand who can rename an app and where the name shows up.

Every ProjectEnvironment runs its own App, each carrying its own **app details** — a name, a description, and (on go-live) the fact that a runnable app exists at all. So one Project groups several Apps, one per environment ([ADR-0016](../adr/0016-app-details-are-per-environment.md), implemented: `project_app` is keyed by `project_environment_id`). These details serve two audiences — humans browsing the Opsiforce app pane, and the app catalog's side panel, which surfaces the one pinned App per project tenant-wide. Three lifecycle moments: **detection**, **pinning**, **editing**.

## Detection

The agent template ships a backend route at `/api/app-meta` reading an `app.meta.json` at the project root. The pod watches that file and probes the app locally, then **pushes** go-live to the backend the moment it happens — the backend never polls. On that push Opsiforce upserts the `project_app` row **for that environment** and notifies the open workspace over SSE so the app pane appears. Each environment writes only its own row, so a published environment running an older snapshot never overwrites Development's identity. The push mechanism — and the single service that also feeds publish, duplicate, and schedule — is [App Readiness](app-readiness.md). The agent goes live as soon as the first feature builds, type-checks, and boots — early, not last — and runs its `agent-browser` feature testing afterwards with the app already live ([ADR-0010](../adr/0010-app-identity-read-at-runtime.md)). A detected app is therefore never a broken boot — the serving probe guarantees that — though it may still be mid-verification.

## Pinning

Pinning graduates an app from "internal preview surface" to "shared with the tenant in the app catalog," where it appears in the side panel for everyone with the corresponding catalog permission. Pinning is gated by `can_pin_apps`, requires the **environment's** auth mode to be `public` (so any catalog user can load the iframe), and only works once that environment has gone live. A project has **at most one pinned environment** — enforced by a partial unique index (`uq_project_app_one_pin_per_project`), so pinning another environment **moves** the pin (clear-then-set in one transaction). All preconditions are enforced on the backend; the frontend just surfaces rejection messages.

## Editing

The agent's first-pass name (`my-internal-tool`) is often not the tenant-facing label, so name/description can be re-curated by humans. Editing is gated by a separate `can_edit_app_details` (distinct from pin authority, so curation and visibility can be delegated independently) and targets the **active** environment's App: Opsiforce writes that environment's `app.meta.json` atomically and mirrors the values into its row (both must succeed or it rolls back), then publishes an SSE event so any open pane updates. Curating a *published* environment is transient — its next publish recopies Development's `app.meta.json` over it. The platform's rule is **latest writer wins**: the agent may rewrite the file later (e.g. "rename the app to X"), and human edits aren't sticky beyond the next agent regeneration — though the agent is instructed to carry an existing name forward verbatim unless explicitly asked to rename, so curation survives routine updates by convention.

## Identity at runtime

New apps read their own identity rather than hardcoding it: the template frontend queries `/api/app-meta` at startup and sets the browser tab title, so a rename (human or agent) shows up on the next load. The catalog side panel reflects the **pinned** environment's own row, so editing that environment updates the catalog immediately (editing a different one doesn't). The favicon follows the same ownership split — the template ships a neutral placeholder and the agent overwrites it at go-live. This shipped as a template change; existing projects keep hardcoded titles until a future migration ([ADR-0010](../adr/0010-app-identity-read-at-runtime.md)).

## See also

- [App Readiness](app-readiness.md) — the push that drives detection ([ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md)).
- [Project Environments](environments.md) — why each environment is its own App ([ADR-0016](../adr/0016-app-details-are-per-environment.md)); auth modes and pinning eligibility.
- [Integrations](../organization/integrations.md) — the external tenant-name mapping the pin reverse-lookup uses.
- Code: `backend/db/schema.ts` (`project_app`, keyed by `projectEnvironmentId`), `backend/src/project/app.service.ts` (`upsertProjectApp`) + `project.service.ts` (`setAppPin`, `updateApp`), `backend/src/internal/apps.controller.ts` (catalog discovery); UI in `frontend/src/components/project/`.

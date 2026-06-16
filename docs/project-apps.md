# Project Apps

Every Opsiforce project can publish a small bundle of "app details" — a name, a description, and (on first detection) a marker that it actually has a runnable web app at all. These details serve two audiences: humans browsing the Opsiforce preview panel, and Makara's side panel surfacing pinned apps tenant-wide. The feature has three intertwined lifecycle moments: **detection**, **pinning**, and **editing**.

## Detection

Each project's agent template ships with a small backend route at `/api/app-meta`, sourced from an `app.meta.json` at the project root. The pod itself watches for that file and probes the app locally, and **pushes** go-live to the backend the moment it happens — the backend never polls. On that push Opsiforce creates a `projectApps` row and notifies the open workspace over SSE, so the app pane appears. From then on the DB row is the canonical thing other parts of the platform read. The agent owns its own file; Opsiforce mirrors what the agent publishes. The mechanics of the push — and the single service that also feeds publish, duplicate, and schedule — live in [App Readiness](app-readiness.md) ([ADR-0015](adr/0015-app-liveness-pushed-not-polled.md)).

The agent's instructions make going live the deliberate last step of the first build: `app.meta.json` is written only after the first feature exists and the agent's type and boot checks pass, so a detected app is never an empty shell or a broken boot.

## Pinning

Pinning is how a project's app graduates from "internal preview surface" to "shared with the tenant in Makara." A pinned app appears in Makara's app side panel for everyone in the tenant who has the corresponding Makara permission. The pin operation is gated behind the `can_pin_apps` Opsiforce permission, requires the project's auth mode to be `public` (so any Makara user can load the iframe without an additional auth dance), and only works once an app has been detected. Unpinning is symmetric and unconditional. All preconditions are enforced on the backend (`setAppPin` in `project.service.ts`); the frontend just confirms intent and surfaces the backend's rejection message in a toast if a precondition fails.

Internally, the pin state is a single boolean on the `projectApps` row, plus two audit fields (`pinnedById`, `pinnedAt`) that record who pinned it and when. Makara discovers pinned apps via an internal endpoint scoped by tenant.

## Editing

The metadata that the agent first publishes — name and description — can be re-curated by humans after the fact. The most common reason is shaping how an app looks in Makara's side panel: the agent's first-pass name may be technical (`my-internal-tool`) while the tenant-facing label should be something prettier. Editing is gated behind a separate `can_edit_app_details` permission, distinct from pin authority, so curation and visibility decisions can be delegated independently.

When the user saves, Opsiforce writes the project's `app.meta.json` directly (the backend has access to the same persistent storage volume the agent pods mount) and then mirrors the new values into the `projectApps` row. Both writes are required to succeed; a failure of either rolls the operation back to the user with an error rather than leaving the system half-updated. The file write is atomic — Opsiforce writes to a temporary file first, then renames it into place, so a partially-written `app.meta.json` is never observable. The polling cache is invalidated and an SSE event is published so any open preview panel immediately reflects the new values without a manual refresh.

The agent remains free to rewrite `app.meta.json` later (for instance, if a user asks it in chat to "rename the app to X"). The platform's rule is "latest writer wins" — there is no override flag that makes human edits sticky beyond the next agent regeneration. This keeps the file genuinely authoritative and the model simple. The agent's instructions, however, tell it to carry an existing name and description forward verbatim and change them only on an explicit rename request — so human curation survives routine agent updates by convention, not enforcement.

## App identity at runtime

New projects' apps read their own identity instead of having it hardcoded. The template frontend queries the same `/api/app-meta` route at startup and sets the browser tab title from the file's `name`; nothing keeps `index.html` in sync by hand, so a rename — human or agent — shows up in the tab on the next load or window focus. Published environments carry their own copy of `app.meta.json`, so a rename made in Development reaches a published app's tab at its next publish; the Makara side panel updates immediately, since it reads the mirrored row.

The favicon follows the same split of ownership: the template ships a neutral placeholder at a fixed path (`frontend/public/favicon.svg`), and the agent overwrites it when the app first goes live with a flat, brand-colored SVG glyph representing what the app does (letter-mark fallback; no image generation unless the user asks).

This shipped as a template change only — existing projects keep their hardcoded titles and lack the favicon until a future template migration ([ADR 0010](adr/0010-app-identity-read-at-runtime.md)).

## Who can do what

| Action | Permission |
|---|---|
| See the pin badge / Edit action | View project (everyone with project access) |
| Pin or unpin | `can_pin_apps` |
| Edit name / description | `can_edit_app_details` |

By default both permissions are granted to the same admin-level groups in Keycloak. Splitting them is a configuration change in `packages/infra/pulumi/keycloak-configurator/opsiforce/permissions.ts`.

## Where this lives in code

- Schema: `packages/opsiforce/backend/db/schema.ts` (`projectApps` table)
- Detection poller: `packages/opsiforce/backend/src/project/app.service.ts`
- Pin / edit endpoints: `packages/opsiforce/backend/src/project/project.controller.ts` (`PATCH /:id/app/pin`, `PATCH /:id/app`)
- Service flow: `packages/opsiforce/backend/src/project/project.service.ts` (`setAppPin`, `updateApp`)
- Makara discovery endpoint: `packages/opsiforce/backend/src/internal/apps.controller.ts`
- UI surface: the preview panel header Edit action (`frontend/src/components/project/project-preview-panel.tsx`) — the project actions kebab is strictly project-level and no longer carries app edit; pinning moved to the per-environment Environments dialog
- Edit dialog: `frontend/src/components/project/edit-app-dialog.tsx`
- Runtime title sync + favicon mount point: the app template (`agent-config/agents/app-builder/template/app/frontend/` — `src/main.tsx`, `index.html`, `public/favicon.svg`); go-live and favicon rules in `agent-config/agents/app-builder/agent.md`

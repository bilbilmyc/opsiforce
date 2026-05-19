# Project Apps

Every Opsiforce project can publish a small bundle of "app details" — a name, a description, and (on first detection) a marker that it actually has a runnable web app at all. These details serve two audiences: humans browsing the Opsiforce preview panel, and Makara's side panel surfacing pinned apps tenant-wide. The feature has three intertwined lifecycle moments: **detection**, **pinning**, and **editing**.

## Detection

Each project's agent template ships with a small backend route at `/api/app-meta`. While the project is Active and a client is listening on the SSE status stream, Opsiforce polls that route every few seconds. As soon as the agent answers with `{ exists: true, name?, description? }` — sourced from an `app.meta.json` at the project root — Opsiforce creates a `projectApps` row, caches the metadata, and stops the poller. From then on, the DB row is the canonical thing other parts of the platform read. The agent owns its own file; Opsiforce mirrors what the agent publishes.

## Pinning

Pinning is how a project's app graduates from "internal preview surface" to "shared with the tenant in Makara." A pinned app appears in Makara's app side panel for everyone in the tenant who has the corresponding Makara permission. The pin operation is gated behind the `can_pin_apps` Opsiforce permission, requires the project's auth mode to be either `public` or `makara` (so Makara's iframe load won't bounce on an OIDC redirect), and only works once an app has been detected. Unpinning is symmetric and unconditional.

Internally, the pin state is a single boolean on the `projectApps` row, plus two audit fields (`pinnedById`, `pinnedAt`) that record who pinned it and when. Makara discovers pinned apps via an internal endpoint scoped by tenant.

## Editing

The metadata that the agent first publishes — name and description — can be re-curated by humans after the fact. The most common reason is shaping how an app looks in Makara's side panel: the agent's first-pass name may be technical (`my-internal-tool`) while the tenant-facing label should be something prettier. Editing is gated behind a separate `can_edit_app_details` permission, distinct from pin authority, so curation and visibility decisions can be delegated independently.

When the user saves, Opsiforce writes the project's `app.meta.json` directly (the backend has access to the same persistent storage volume the agent pods mount) and then mirrors the new values into the `projectApps` row. Both writes are required to succeed; a failure of either rolls the operation back to the user with an error rather than leaving the system half-updated. The file write is atomic — Opsiforce writes to a temporary file first, then renames it into place, so a partially-written `app.meta.json` is never observable. The polling cache is invalidated and an SSE event is published so any open preview panel immediately reflects the new values without a manual refresh.

The agent remains free to rewrite `app.meta.json` later (for instance, if a user asks it in chat to "rename the app to X"). The platform's rule is "latest writer wins" — there is no override flag that makes human edits sticky beyond the next agent regeneration. This keeps the file genuinely authoritative and the model simple.

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
- UI surfaces: preview panel header (`frontend/src/components/project/project-preview-panel.tsx`) and the project actions kebab "App" submenu (`frontend/src/components/project-actions-menu.tsx`)
- Edit dialog: `frontend/src/components/project/edit-app-dialog.tsx`

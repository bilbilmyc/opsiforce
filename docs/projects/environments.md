# Project Environments & Publishing

> The model that splits a Project (a durable shell) from the ProjectEnvironments that actually run, and how an app is published from Development into other environments. This is the spine that most other features hang off — read it before working on publishing, auth, schedules, or app identity.

A project used to be one running thing: one pod, one URL, one working copy. It is now a **Project** (identity, ownership, cross-environment policy — it runs nothing itself) grouping one or more **ProjectEnvironments** (the things that run). Every project is born with a Development environment where the agent builds, exactly as before, and can then be **published** into other environments (Production, Staging…) so the same app runs in a prod-like target.

## The two-entity model

Keeping these separate is the whole point:

- An **Environment** is a tenant-scoped registry row (name, description, immutable URL slug). It is the *set of publish targets* offered to every project in the tenant. Each tenant has two **protected** environments — Development and Production — that can't be renamed or deleted; admins add others. Renaming a custom environment renames it for every project, because projects reference the registry by id.
- A **ProjectEnvironment** is a per-project instance bound to one Environment. It owns the runtime state: workspace directory, pod, status, pod IP, auth mode, schedules, and service-gateway key. It does **not** own LLM keys — those are project-scoped and shared across environments.

```
Tenant ── Environment registry: [ Development* , Production* , Staging ]   (*protected)
              ▲ binds to                ▲ binds to
Project ── ProjectEnvironment(Development)   ProjectEnvironment(Production)
 (shell)        = the working copy              = a published snapshot
```

Two structural decisions underpin this and are documented as ADRs rather than repeated here: the **two-entity split** ([ADR-0001](../adr/0001-environment-vs-project-environment.md)), and the fact that the **Development ProjectEnvironment reuses the project's id** ([ADR-0002](../adr/0002-development-environment-reuses-project-id.md)) — which is what kept every existing URL, pod name, and directory valid through a metadata-only migration. Published environments get fresh uuids.

## What moved, what stayed

The project shell keeps identity (tenant, workspace, agent, title), project-level budget and idle timeouts, [Resources](../runtime/resources.md), and a project-level **disabled** flag. Everything pod- and runtime-shaped moved to the environment. Actions follow the split: rename, duplicate, disable/enable, and delete act on the **project** (disable tears down every environment's pod; delete removes them all and the Bifrost team); restart, publish, auth, env-vars, and delete-environment act on a **single environment**. Budgets stay anchored at the project — one Bifrost team, one shared key pair across all environments ([ADR-0003](../adr/0003-one-bifrost-team-per-project-keys-per-env.md)).

## Public URLs

An app's public hostname carries its environment: `{envId}-{slug}.apps…`, where the slug is `dev`/`prod` for protected environments and a slugified, editable-once, then-immutable identifier for custom ones. The routing key is still the environment id; the slug is a readable discriminator, and renames never change it, so published URLs outlive renames. Every environment also answers on its legacy bare `{envId}` host (old links keep working), and a wrong suffix redirects to the canonical one. The mechanics and trade-offs are in [ADR-0012](../adr/0012-public-app-hostnames-carry-environment-slug.md).

## Publishing

Publishing materializes or updates a non-Development environment from Development's files. It is **git-based and incremental** ([ADR-0004](../adr/0004-git-based-incremental-publish.md)): the workspace is a git repo whose `.gitignore` is the deploy boundary, so a publish commits Development's tree and the target becomes a local clone reset to that commit; a *publish update* pulls only the diff. Because git ignores runtime state, the production database, installed dependencies, and the per-environment config file are preserved across updates by construction, and the deployed commit is recorded for rollback. Deploys are **in-place with rollback** — the environment holds a `publishing` status while files change and its pod rebuilds; a failed (or server-interrupted) deploy rolls back to the previous commit and variables, so production never runs a half-deployed version.

Each environment carries its own config in `app/opsiforce.env.json` — a flat set of variables the app reads from the file at startup (distinct from platform-injected pod env vars). That file is excluded from the publish sync, so an update never clobbers production's values; the publish form pre-fills keys from Development and values from the target. **Schedules** travel as an opt-out copy: the dialog pre-checks Development's schedules and recreates the chosen ones for the target (see [Schedules](schedules.md)).

### Environment Variables editor

Beyond the publish form, every environment (including Development) has an **Environment variables editor** in its row menu, gated by its own permission. It edits the same `opsiforce.env.json` directly. Because the app reads the file once at boot, the editor offers a **"Restart app to apply now"** toggle that drives a lightweight **App restart** — killing just the app processes via the [in-pod control process](../adr/0009-in-pod-control-process.md) so the inner guards revive them with the new values, rather than recreating the whole pod. (Pods on an older image with no control port fall back to a full recreate.)

## App auth

How visitors reach an app — **public**, **manual** (the owner's OIDC), or **managed** (a shared identity provider configured by the platform operator, tenant-scoped) — is a property of the *environment*, not the project, enforced by a small OIDC gate on the environment's own host. A newly published environment **inherits Development's auth as a one-time, fail-closed seed** at first publish, then is managed independently. Only a `public` environment can be pinned to the app catalog. The enforcement model — keyed by routing id, seeded by cloning Development's middleware, applied before the app can serve — is [ADR-0007](../adr/0007-per-environment-app-auth.md).

## Using it

Everything environment-shaped lives behind one switcher-style **Environments** control next to the workspace tabs; its trigger shows the environment currently being viewed, and there is no global Publish button. The panel lists every environment the app can run in — Development, then each registry target whether published or not. Clicking an existing environment switches the whole workspace (app, code, DB, chat) to it; **Publish** sits on each non-Development row, pre-targeted, reading "Publish update" once something runs there, and always confirming first. The row menu holds the rest an environment owns — auth, environment variables, schedules, restart, delete — so an action always targets the row you pick, while the project menu stays strictly project-level (rename, duplicate, disable, delete, settings). When a non-Development environment is active, a banner warns that edits there diverge from Development and are overwritten on the next publish.

A publish runs asynchronously and reports stage-by-stage progress (committing → building → migrating → done/failed) over the project's SSE event stream. Closing the progress dialog **minimises it to a corner card** rather than abandoning the publish; the Environments switcher trigger mirrors the state (spinner / success / failure) so an in-flight or failed publish always leaves a trace in the workspace chrome.

Four permissions gate these surfaces: `can_manage_environments`, `can_publish_project`, `can_manage_environment_variables`, `can_delete_environment` (see [Permissions](../organization/permissions.md)).

## See also

- [Duplication](duplication.md) — the sibling flow that copies a whole project (working state included), reusing the same git path ([ADR-0011](../adr/0011-duplication-reuses-git-publish-path.md)).
- [Project Apps](project-apps.md) — per-environment app identity and the catalog pin ([ADR-0016](../adr/0016-app-details-are-per-environment.md)).
- [App Readiness](app-readiness.md) · [Schedules](schedules.md) · [Resources](../runtime/resources.md).
- Code: `backend/src/environment/` (registry), `backend/src/project-environment/` (per-project instances **and** the environment-variables service that writes `opsiforce.env.json`), `backend/src/publish/` (worker + SSE), `backend/src/git/` (`GitService`), `backend/src/project/project-auth.service.ts` (Traefik middleware keyed by routing id).

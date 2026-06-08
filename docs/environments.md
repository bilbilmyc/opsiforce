# Project Environments & Publishing

Until now a project was a single running thing: one pod, one app URL, one working copy. This feature splits that into a **Project** (a durable shell — identity, ownership, budget, cross-environment policy) and one or more **ProjectEnvironments** (the things that actually run). Every project starts with one environment, **Development**, where the agent builds the app exactly as before. A project can then be **published** into other environments (Production, Staging, …) so the same app runs in a prod-like target.

## The two-entity model

There are two distinct concepts, and keeping them separate is the whole point:

- An **Environment** is a tenant-scoped registry row — just a `name` + `description`. It is the *set of publish targets* offered to every project in the tenant. Each tenant has an immutable **Development** environment by default; tenant admins add others. Renaming "Production" once renames it for every project, because projects reference the registry by id.
- A **ProjectEnvironment** is a per-project *instance* bound to one Environment. It owns all the runtime state that used to live on the project: its workspace directory, pod, status, pod IP, its service-gateway key, auth mode, and schedules. It does *not* own LLM virtual keys — those are project-scoped and shared across every environment (see below).

```
Tenant ── Environment registry: [ Development* , Production , Staging ]   (*immutable)
              ▲                         ▲
              │ binds to                │ binds to
Project ── ProjectEnvironment(Development)   ProjectEnvironment(Production)
  (shell)        = the working copy              = a published snapshot
```

A subtle but load-bearing detail: the **Development ProjectEnvironment reuses the project's id**. Public routing keys off an opaque id in the subdomain (`{id}.apps…`, `…code`, `…db`), pods are named from it, and the workspace directory is `projects/{id}`. By giving Development the same id as its project, every existing URL, pod, and directory stays valid — the migration that introduced this feature was metadata-only. Published environments get fresh uuids and their own directories. This asymmetry (Development ids look like project ids, others are random) is intentional; see the ADRs.

## What moved, what stayed

The project shell keeps identity (tenant, workspace, agent, title/description), the project-level budget and idle timeouts, and a new project-level **disabled** flag. Everything pod- and runtime-shaped moved to the environment. Actions follow the same split: rename, duplicate, disable/enable, and delete act on the **project** (disable tears down every environment's pod; delete removes them all and the Bifrost team); restart and delete-environment act on a **single environment**. Duplicating a project copies only its Development environment into the new project.

Budgets stay anchored at the project: there is one Bifrost team per project — it carries the cap — and a single chat + backend virtual-key pair *under that team* that every environment shares. The keys are born with the Development environment (which reuses the project id), so the Development environment's pair is the project's pair; publishing never mints new keys. Per-environment usage attribution (separate keys per environment) is a deferred enhancement, so for now all of a project's environments report under the same key pair.

## Publishing

Publishing materialises or updates a non-Development environment from Development's files. It is **git-based and incremental**: the workspace is already a git repo whose `.gitignore` separates app source from runtime state, so publishing commits Development's working tree and makes the production environment a local clone reset to that commit. Redeploys pull only the difference; the production database, installed dependencies, and the per-environment config file are preserved across redeploys by construction, and the deployed commit is recorded for rollback.

Each environment carries its own configuration in an `app/opsiforce.env.json` file (a flat set of string variables the app reads directly from the file at startup, not from the process environment — keeping the app's own secrets distinct from the platform-injected env vars like the gateway key). That file is excluded from the publish sync, so a redeploy never clobbers production's values. The publish form pre-fills the variable keys from Development and the values from production (on redeploy) or Development (on first publish); the user confirms or overrides them. Schedules travel as definitions, opt-out: the publish dialog pre-checks Development's schedules and the user can uncheck any before they are created for the target environment.

Deploys are **in-place, restart-only-on-success** for the first version: the new files are staged and the app is rebuilt and migrated on the pod before the running app is replaced, and if the deploy fails the environment is rolled back to its previously deployed commit and restarted, so a broken build never takes production down (beyond a few-seconds restart blip). Production runs the same four services as Development; the only difference is that its startup builds and starts the app instead of running dev servers with hot-reload. App database migrations run automatically on boot, each in its own transaction. Zero-downtime (blue-green) deploys and keeping production warm against idle-suspension are deliberately deferred.

## Using it

When a project has only Development, the experience is unchanged except for a **Publish** button. Once it has more than one environment, the project view gains an **environment switcher** (which re-points the app, code, database, and chat surfaces to the selected environment), a **Manage** panel listing each environment with its URLs and per-environment restart/delete, and a **warning banner** whenever a non-Development environment is active — editing there diverges from Development and is overwritten on the next publish. Pinning an app to the Makara catalog targets one chosen environment and still requires that environment's auth mode to be public.

While a publish runs, the dialog tracks each stage (committing → building → migrating → done/failed) over a **server-sent events stream** rather than polling: the worker announces every status change on the shared per-project event channel (the same Redis pub/sub bus that powers the live project-status stream), and the dialog's `EventSource` reloads and renders the latest job state on each notification.

Three permissions gate the new surfaces (defined in the Keycloak configurator and mirrored in the backend and frontend): `can_manage_environments` (tenant admins CRUD the environment registry), `can_publish_project`, and `can_delete_environment`.

## Where the code lives

- Tenant registry: `backend/src/environment/` — Environment CRUD, Development locked.
- Per-project instances: `backend/src/project-environment/` — the runtime-bearing `ProjectEnvironmentContext` and its data access; the project lifecycle (`backend/src/project/project.service.ts`) operates on environments by id.
- Publishing: `backend/src/publish/` — the publish service, the git helper, the staged BullMQ worker, and the SSE status stream (`publish.controller.ts`, which the worker feeds via `ProjectEventsService`).
- The agent app template's production startup and per-environment config live in `agent-config/agents/app-builder/template/app/`.
- The design rationale is captured in `docs/adr/0001`–`0004`; the glossary is in `CONTEXT.md`.

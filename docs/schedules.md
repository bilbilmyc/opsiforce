# Schedules

Agents can register recurring cron jobs against the apps they build — a daily report, a periodic sync, a health check. The platform stores each job, fires it on schedule from *inside* the cluster (waking a suspended pod if it has to), calls the app's own endpoint, and records every run with its status and latency.

## Per environment

A schedule belongs to **one ProjectEnvironment**, not to the project as a whole, and it fires only against that environment's running app: Development's schedules hit Development's pod, Production's hit Production's, independently. The agent registers schedules through the service gateway, and the gateway token already identifies which environment's pod is calling — so a schedule the agent creates while building in Development is owned by Development, and one created from a published environment's pod is owned by that environment. (Development is the environment that reuses the project id, so its schedules are keyed by the project id; published environments use their own ids — see [environments](environments.md) and the ADRs.)

Publishing carries schedules forward as a **one-time copy**: the publish dialog pre-checks Development's schedules, the user can uncheck any, and the chosen ones are recreated for the target environment. So the same-named schedule can legitimately exist in several environments at once — these are **intentional, independent copies**, each firing against its own app, not accidental duplicates. A name is unique only *within* an environment.

## Firing and wake-on-fire

Firing happens internally, never through the public ingress. When a job fires the worker resolves the owning environment; if that environment's pod is suspended it wakes it — the same flow as a user opening the project — waits for it to become ready, then calls the app's endpoint and records the response (status, latency, any error) as an execution. If the environment is disabled or failed, the worker records the reason instead of calling. Schedules fire in the **project's timezone**, captured from the user's browser so the agent never has to ask, and stamped on each schedule when it is created.

## Security

Schedules ride the same per-project **service-gateway token** the agent already uses for outbound calls: the token authenticates the caller and resolves its project and environment, so there are no new credentials. The schedule endpoints sit under the cluster-internal gateway prefix that the external proxy blocks, so they are unreachable from the internet, and firing calls the pod directly inside the cluster — never through the public ingress or the auth proxy.

Managing schedules **from the UI** requires `can_manage_schedules`: the admin controller is gated class-level with `@RequirePermission`, covering the list, the scoped view, and every edit/run/delete. This closed a real gap — the controller previously had no guard, so any authenticated member could manage every project's schedules. Agent-facing endpoints are unaffected (they authenticate with the service-gateway token, not a human role).

## Viewing and managing

Two views, both built around the per-environment model:

- The tenant-wide **Schedules** page (top navigation) presents **one tab per registry environment** — Development, Production, and so on — and loads that environment's schedules **on demand** when you open its tab, with each row labelled by its project. Because environment names come from the tenant's shared registry, an environment tab reads coherently even across projects, listing *every* project's schedules for that environment. From here you can edit the cron expression, toggle a schedule on or off, trigger a run immediately, view execution history, and delete.
- Opening **Schedules** from an environment's row in the project's **Environments** dialog drops into a **single project-environment view**: only that one app's schedules for that one environment, filtered by its `projectEnvironmentId` rather than by the shared registry environment — so *this* app's Development, not every project's Development. A breadcrumb names the project and environment, and an **All schedules** link returns to the tenant-wide tabbed view. This is the only per-environment launcher; the project menu no longer carries a Schedules entry. Both views are the same page (`frontend/src/pages/schedules.tsx`); the presence of a `projectEnvironmentId` in the URL selects the scoped view.

Both views require `can_manage_schedules`; without it the dropdown entry, the per-environment launcher, and the page itself all disappear (the page redirects home), matching the server.

```
Agent in a pod
  └─ POST $SERVICE_GATEWAY_URL/schedules        (token ⇒ project + environment)
        │
        ▼
  backend stores the schedule, owned by that environment
        │
        ▼  cron fires (in the project's timezone)
  worker wakes the environment's pod if suspended, then
        │
        ▼
  calls the app's endpoint ⇒ records an execution
```

## Where the code lives

- Backend: `backend/src/schedule/` — the agent-facing endpoints (gateway-guarded, environment-scoped), the tenant-facing admin endpoints, the service (database, BullMQ scheduler sync, timezone, execution recording), and the worker (wake-on-fire, the HTTP call, execution logging).
- The schedule rows and their executions live in `backend/db/schema.ts` (`projectSchedules`, keyed per environment; `scheduleExecutions`).
- Publishing mirrors Development's chosen schedules into the target environment in the publish worker (`backend/src/publish/`).
- Frontend: the tenant-wide page is `frontend/src/pages/schedules.tsx` (one tab per environment, loaded on demand); the per-environment launcher lives in the Environments dialog under `frontend/src/components/project/environments/`.
- The agent learns to use schedules from `agent-config/agents/app-builder/skills/schedules/SKILL.md`.

## Future work

- **Prompt mode** — a schedule wakes the agent with a prompt instead of calling an endpoint.
- **Per-project cap** — a limit on the number of schedules, to bound worker load.
- **One-shot jobs** — "run at a timestamp" in addition to recurring cron.

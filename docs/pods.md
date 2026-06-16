# Pods

The **Pods** page is a read-only operational view of an Organization's running environment pods. Where most of Opsiforce is about *building* and *configuring* projects, this page answers a different, operator-facing question: **what is running right now, what is keeping each pod alive, and when will it suspend?** It is the first page of the [Admin](admin.md) section — the operational counterpart to Settings — reached from the avatar dropdown.

## What it shows

One row per running **ProjectEnvironment** pod, grouped by Project (Development first, then by environment name). Each row carries the pod's status, age, [Resources](resources.md) class, configured idle timeouts, and — the centrepiece — its live **Keep-alive activity**: when the pod was last kept alive and by which kind, with a ticking countdown to suspension.

Keep-alive has exactly two kinds, mirroring the timeout system (see [Request Flows](request-flows.md)):

- **Agent activity** — a person working through the agent (chat, the code editor, the database viewer, uploads).
- **App activity** — the running App's own traffic (its public and preview URLs, and scheduled runs).

Each kind has its own idle timeout; a pod is suspended only once **both** have been idle past their timeouts. The page renders the two as separate colour-coded tracks (agent / app) so "why is this pod still alive" reads at a glance, and a single "suspends in …" line shows the later of the two countdowns. Expanding a row reveals the pod's identity and placement — name, node, IP, restart count, exact start time, and the deployed commit.

## Where the data comes from

The view joins three stores at request time, and writes nothing:

```
Kubernetes  ── which pods exist + identity/health  ─┐
                                                     ├─►  one row per pod
Postgres    ── names, timeout policy, tenant, status ┤
                                                     │
Redis       ── live keep-alive (read on demand)  ────┘
```

Kubernetes is the source of truth for the **row set**: the page enumerates the agent-pod informer cache and intersects it with the selected Organization's projects. Postgres supplies the human-readable names, the per-project timeout and Resources policy, and the tenant attribution (pods carry no tenant label — the project does). Redis supplies the keep-alive: two short-lived keys per environment whose *value* is the last-touch time and whose *time-to-live* is the countdown to suspension. The countdown is sent to the browser as a remaining duration (not an absolute expiry) so it ticks down smoothly regardless of clock differences between server and client.

Because Kubernetes — not the database — drives the row set, inconsistencies surface naturally:

- **Drift**: a pod is running while its environment is marked suspended, disabled, or failed in the database. Flagged inline on the row.
- **Ghost**: an environment is marked active but has no pod. Summarised as a per-project footnote.

Pods belonging to the pending-project pool (environments still being claimed) are deliberately excluded — they are infrastructure, not an Organization's running work.

The decision to read keep-alive live from Redis rather than persist it (and specifically *not* to write it onto pod labels/annotations, which would storm the informer with a write per request) is recorded in [ADR-0013](adr/0013-pods-view-reads-live-keepalive-from-redis.md).

## Who can use it

Visibility is gated by the `can_view_pods` permission (an org-admin-level grant; see [Permissions](permissions.md)). The page is tenant-scoped: a member sees only the running pods of the Organization currently selected. It is strictly read-only — there are no actions on the page beyond a deep link to open the project.

## Where the code lives

- Backend: `backend/src/admin/` (the `GET /api/pods` controller and the join service — the `admin` module is the operational read surface, distinct from the `pod` lifecycle module), reading the pod informer in `backend/src/pod/` and the keep-alive keys via `TimeoutService.getKeepAliveBatch` in `backend/src/timeout/`.
- Frontend: the page at `frontend/src/pages/pods.tsx`, mounted by the Admin layout at `frontend/src/routes/admin/pods.tsx`, with the keep-alive and status cells under `frontend/src/components/pods/` and the data hook in `frontend/src/api/pods.ts`.

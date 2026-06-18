# Pods

> The read-only operational view of an Organization's running environment pods — what is running now, what is keeping each pod alive, and when it will suspend. The first (currently only) page of [Admin](../organization/admin.md).

Most of Opsiforce is about *building* and *configuring* projects. Pods answers the operator's question instead: which ProjectEnvironment pods exist right now, and why. One row per running pod, grouped by Project (Development first, then by environment name), showing status, age, [Resources](resources.md) class, configured idle timeouts, and — the centrepiece — live **Keep-alive activity**: when the pod was last touched and by which kind, with a countdown to suspension.

Keep-alive has exactly two kinds, mirroring the timeout system: **agent activity** (a person working through the agent) and **app activity** (the running App's own traffic). Each has its own idle timeout and the pod suspends only once both have lapsed, so the page renders two colour-coded tracks and a single "suspends in …" line (the later of the two). The countdown is sent as a remaining duration, not an absolute time, so it ticks smoothly regardless of server/client clock skew.

## Where the data comes from

The view joins three stores at request time and writes nothing. Kubernetes is the source of truth for the **row set** — the agent-pod informer cache, intersected with the selected Organization's projects. Postgres supplies names, the timeout/Resources policy, and tenant attribution (pods carry no tenant label; the project does). Redis supplies keep-alive: two short-lived keys per environment whose *value* is the last-touch time and whose *TTL* is the countdown.

Because Kubernetes drives the row set, inconsistencies surface naturally: **drift** (a pod runs while its environment is marked suspended/disabled/failed — flagged inline) and **ghosts** (an environment marked active with no pod — a per-project footnote). Pending-pool pods are excluded; they are infrastructure, not an Organization's work. Reading keep-alive live from Redis rather than persisting it — and specifically not writing it onto pod labels, which would storm the informer — is recorded in [ADR-0013](../adr/0013-pods-view-reads-live-keepalive-from-redis.md).

## Who can use it

Gated by `can_view_pods` (see [Permissions](../organization/permissions.md)) and scoped to the currently-selected Organization. Strictly read-only — the only action is a deep link to open the project.

## See also

- [Admin](../organization/admin.md) — the section this page lives in, and the configure-vs-operate split ([ADR-0014](../adr/0014-admin-section-and-operational-view-module.md)).
- [Pod Lifecycle](pod-lifecycle.md) — what the statuses mean and how suspension works.
- Code: `backend/src/admin/pods-overview.controller.ts` (`GET /api/pods`) + `pods-overview.service.ts` (the three-store join), reading `backend/src/pod/` (informer) and `TimeoutService.getKeepAliveBatch` in `backend/src/timeout/`; frontend `frontend/src/pages/pods.tsx`, mounted by `frontend/src/routes/admin/`.

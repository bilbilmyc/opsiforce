# Agent Status

> How the sidebar knows a Project's Agent is **Working** — processing a run — without polling: the pod pushes transitions, the backend holds the level in memory, and the projects list carries it. Read this to understand the spinner beside a project row.
>
> **Status: implemented (self-healing)** ([ADR-0019](../adr/0019-agent-status-pushed-and-resynced-not-heartbeated.md)). The level is correct at first paint from the projects list, updates live in an open sidebar over the user-scoped stream, and cannot stick: boundary snapshot pushes, lifecycle clears, and the backend-boot reconcile re-read truth wherever state could have been lost.

A user working across several Projects has no way to tell, without opening each one, whether an Agent is still working on something they asked for. The Agent keeps running after the user navigates away — by design — but its state was visible only inside the one open chat. **Agent Status** is the per-Project signal that fixes that: Working when the Agent is processing a run (including mid-run provider retries), Idle otherwise. It is distinct from *pod lifecycle* (`ProjectStatus`) and from Keep-alive's *agent activity* — see [CONTEXT.md → Agent Status](../../CONTEXT.md).

## How it works

The pod reports; the backend listens. Nothing polls. This is the second producer on the pushed-state path [App Readiness](../projects/app-readiness.md) established — same channel, same delivery contract.

```
AGENT POD (opencode container)              BACKEND
┌────────────────────────────┐           ┌───────────────────────────┐
│ opencode — sessions          │           │ GatewayAuthGuard           │
│  GET /session/status         │  push     │  token → {project, env}    │
│  GET /event (SSE)            │  {working}│                            │
│                             │           │ AgentStatusService         │
│ agent-control (Go)          ├──────────►│  • per-env Working level   │
│  • subscribe session.status │  /api/    │  • OR across environments  │
│  • snapshot on boot/reconnect│ gateway/  │  • flip → Redis bus        │
│  reuses SERVICE_GATEWAY_*   │  agent/   │ GET /projects → agentStatus│
│  (already in its env)       │  status   │ SSE /agent-status/events   │
└────────────────────────────┘ at-least  └───────────────────────────┘
        ▲ same channel App Readiness  once
        └ and schedules already use
```

`agent-control` subscribes to opencode's event bus and tracks the set of sessions reported `busy` or `retry` by the native `session.status` event (never the deprecated `session.idle`). Working is simply whether that set is non-empty, which covers sub-agent sessions as naturally as the root one. While the stream is up it pushes one idempotent `{working}` event **only when the level changes**; on boot and on every event-stream reconnect it re-reads `GET /session/status` and pushes the snapshot **unconditionally** — even an unchanged or Idle level, because the backend's copy may have gone stale during the gap (a run that finished while the process was down must still clear). So a pod restart, a container crash, or its own crash self-heals by re-reporting truth.

The backend's `AgentStatusService` owns the level per ProjectEnvironment in memory, keyed by the environment behind the pushing pod's gateway bearer — a pod cannot report for another environment. A Project is Working when **any** of its environments is, so prompting a published environment's Agent spins the project too. `GET /projects` carries the resulting `agentStatus` (`working` | `idle`) per project, and the sidebar renders the extra-small spinner as a leading icon while Working, nothing while Idle, with an accessible "Agent working" label.

Live updates ride the existing Redis project-events bus: whenever a project's OR-level flips, `AgentStatusService` publishes the project id, and a **user-scoped multiplexed stream** (`GET /agent-status/events`, SSE) fans it out. On connect the backend computes the connecting user's visible-project set — tenant + workspace membership, the same predicate as the projects list — once per connection (a reconnect recomputes it), emits each visible project's current level, then forwards only `{projectId, agentStatus}` transitions for those projects; anything outside the user's visibility never reaches the wire. The frontend opens exactly **one EventSource per tab** regardless of project count, feeding a small `projectId → agentStatus` store that is seeded from the projects-list payload (without clobbering fresher stream values) and read by the project row — so the spinner appears and clears live, with no reload and no polling.

## Why there is no heartbeat

opencode's status is *queryable at rest* (`GET /session/status`), so staleness is repaired by re-reading truth at boundaries rather than by continuously proving liveness. An Idle pod pushes nothing at all — the resting state costs zero traffic — and the boot/reconnect snapshot re-establishes the level whenever the subscription could have missed a transition. The other two boundaries live in the backend: it **clears the level at every environment-lifecycle transition it drives** — suspend, restart, disable, fail, delete, and the pod-recreating publish — because a pod that stops existing cannot be Working (`AgentStatusService.clear`, called beside each `appReadiness` boundary), and on boot it runs a **one-shot reconcile** that re-reads `/session/status` of every active environment's pod before the HTTP listener starts, so runs in flight across a backend restart reappear as Working without user action. The full reasoning and the rejected heartbeat/poll/persist options are in [ADR-0019](../adr/0019-agent-status-pushed-and-resynced-not-heartbeated.md).

The in-memory level assumes the single backend replica, exactly as `AppReadinessService` does; scaling out moves the map to Redis, the path ADR-0015 already prescribes for `serving`.

## Rollout

`agent-control` is a baked binary, so the change lands only when pods are **recreated onto a new image** — delivered by an empty `requiresPodRecreate` agent-update migration (`20260704_agent_status_push`) alongside the `agent-config/agent-image-version.json` bump, not by a version bump alone.

## See also

- [App Readiness](../projects/app-readiness.md) — the sibling pushed-state feature this one copies ([ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md), incl. the edges-not-a-heartbeat amendment).
- [Service Gateway](../gateways/service-gateway.md) — the channel the pod pushes over.
- [ADR-0019](../adr/0019-agent-status-pushed-and-resynced-not-heartbeated.md) — the full design, including the slices past correct-on-fetch.
- Code: in-pod watcher `proxy/cmd/agent-control/status.go` (beside the reporter in `main.go`); backend owner `backend/src/project/agent-status.service.ts`; push endpoint `backend/src/project/agent-status.controller.ts` (`POST gateway/agent/status`, `GatewayAuthGuard`); user-scoped stream `backend/src/project/agent-status-stream.controller.ts` (`GET agent-status/events`); projects-list field in `ProjectService.findAllForUser`; frontend store + EventSource `frontend/src/api/agent-status.ts` (mounted in `project-sidebar.tsx`); sidebar spinner `frontend/src/components/project-card.tsx`.

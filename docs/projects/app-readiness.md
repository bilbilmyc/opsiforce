# App Readiness

> How the platform knows an App has gone live and is serving, without polling — the pod pushes; the backend listens. Read this to understand the one service that gates the app pane, publish, duplicate, and schedule.
>
> **Status: implemented** ([ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md)). The backend no longer polls `/api/app-meta`.

Opsiforce cares about two separate facts about a Project's running App, and for a long time it conflated them:

- **Go-live** — the App first exists and is running: the agent has written `app.meta.json` (so the App has a name) and its process answers on its port. This is what makes the in-workspace app pane appear and what the app catalog reflects.
- **App serving** — the App's process is up and responding right now. Publishing, duplicating, and firing a schedule all have to wait for this before they proceed.

These are different facts: an App can serve a starter page long before the agent decides to go live, and a gone-live App can later crash. Treating "does it serve?" and "has it gone live?" as one polled question is what produced both the wasted work and the confusing failure modes recorded in ADR-0015.

## How it works

The pod reports; the backend listens. Nothing polls.

```
AGENT POD (opencode container)              BACKEND
┌────────────────────────────┐           ┌───────────────────────────┐
│ app — serves on its port    │           │ GatewayAuthGuard           │
│                             │  push     │  token → {project, env}    │
│ agent-control (Go)          │  state    │                            │
│  • inotify(app.meta.json)   ├──────────►│ AppReadinessService        │
│  • probe(localhost app port)│  /api/    │  • owns per-env app state  │
│  reuses SERVICE_GATEWAY_*   │  gateway/ │  • awaitReady(env)         │
│  (already in its env)       │  app/state│  → projectApps (identity)  │
└────────────────────────────┘ at-least  │  → SSE to the workspace    │
        ▲ same channel agents   once      │ proxy /failure ───────────►│ (pod recovery)
        └ already use for schedules        └───────────────────────────┘

consumers of AppReadinessService.awaitReady(): publish · duplicate · schedule
the app pane reads identity (projectApps) over SSE — not awaitReady
```

`agent-control` pushes one idempotent `{serving, live, name, description}` event **only when that state changes** (no periodic re-assert — see [§ Why there is no heartbeat](#why-there-is-no-heartbeat)) — `live` meaning `app.meta.json` is present *and* the app answers locally. The backend's `AppReadinessService` is the single owner of per-environment app state: it records identity into `projectApps`, notifies the open workspace over SSE so the app pane appears, and resolves `awaitReady` for whatever publish/duplicate/schedule flow is waiting. The runtime proxy's real-path `/failure` report is a separate concern — pod **recovery**, not readiness: it inspects k8s pod state and restarts or wakes the pod from real traffic, and never writes `serving`.

### Why the inotify watch is safe here (cf. ADR-0009)

ADR-0009 rejected an in-pod inotify watch for the *Environment Variables* file because the **backend** writes that file through its own CephFS client, and inotify events do not cross CephFS clients — an in-pod watch fires for agent edits but never for backend edits. App readiness relies on exactly the half that works: the reporter watches `app.meta.json` for the **agent's** in-pod write at go-live. That file does have a second writer — a human *Edit-details* save, which comes from the backend — but the reporter neither sees nor needs it: `updateApp` applies an Edit-details change to `projectApps` and the SSE stream directly. So the ADR-0009 rule still holds — we never depend on inotify to observe a backend-originated write.

## Reliability

Reliability rests on the push, not a backstop probe: at-least-once delivery (agent-control retries until acked), identity persisted in `projectApps` so a backend restart never loses detection, and a startup resync in agent-control. There is one deliberately-accepted gap — a pod its kubelet can reach but the cluster cannot. The properties, and why that gap is acceptable, are in [ADR-0015 § Consequences](../adr/0015-app-liveness-pushed-not-polled.md#consequences).

## Why there is no heartbeat

The reporter pushes **only on edges** — go-live, serving↑, serving↓ — never on a timer, because **nothing reads `serving` as a standing value.** Its only consumer is `awaitReady` (publish, duplicate, schedule), and each recreates or wakes the pod — calling `markDown` — *before* it waits, so it always wants the next *edge* on a fresh pod, never a remembered level. A `serving` left stale by an ungraceful pod death is therefore never consulted.

This splits the two facts by where they live: **identity** stays durable in `projectApps`, while **serving** is a thin in-memory edge owned by `AppReadinessService`, fed only by pushes. `markDown` keeps `serving` honest at every pod-lifecycle boundary the backend controls — pod (re)create (`spawnPodForEnvironment`), idle-suspend (`timeout.listener`), and project disable (`disable`); deleting a project or environment evicts the key (`clear`) so the map can't grow without bound.

The trade behind dropping the re-push — why `serving` is never a Postgres column, and the multi-replica path (Redis with a TTL) when one backend replica is no longer enough — is in [ADR-0015 § Amendment](../adr/0015-app-liveness-pushed-not-polled.md#amendment-2026-06-17-edges-not-a-heartbeat).

## Rollout

`agent-control` is a baked binary, so the feature lands only when pods are **recreated onto a new image** — delivered by an empty `requiresPodRecreate` agent-update migration (`20260616_app_readiness_push`), not by a plain version bump. Why a file migration is the right lever for a binary swap is in [ADR-0015 § Consequences](../adr/0015-app-liveness-pushed-not-polled.md#consequences).

## See also

- [Project Apps](project-apps.md) — how detected identity becomes per-environment App Details and the catalog pin.
- [Service Gateway](../gateways/service-gateway.md) — the channel the reporter pushes over.
- [ADR-0015](../adr/0015-app-liveness-pushed-not-polled.md) (incl. the 2026-06-17 edges-not-a-heartbeat amendment) · [ADR-0009](../adr/0009-in-pod-control-process.md) (the in-pod control process the reporter sits beside).
- Code: in-pod reporter `proxy/cmd/agent-control/reporter.go` (beside the `/health`+`/restart-app` server in `main.go`); backend owner `backend/src/project/app-readiness.service.ts` (`awaitReady`); push endpoint `backend/src/project/app.controller.agent.ts` (`POST gateway/app/state`, `GatewayAuthGuard`); identity via `AppService.upsertProjectApp`.

# App Readiness

> **Status: implemented** (see [ADR-0015](adr/0015-app-liveness-pushed-not-polled.md)). Detection, publish, duplicate, and schedule all run on the push described here; the backend no longer polls `/api/app-meta`.

Opsiforce cares about two separate facts about a Project's running App, and for a long time it conflated them:

- **Go-live** — the App first exists and is running: the agent has written `app.meta.json` (so the App has a name) and its process answers on its port. This is what makes the in-workspace app pane appear and what Makara's catalog reflects.
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
        ▲ same channel agents   once      │ proxy /failure ───────────►│ (app down)
        └ already use for schedules        └───────────────────────────┘

consumers of AppReadinessService.awaitReady():
  preview gate (SSE) · publish · duplicate · schedule
```

`agent-control` pushes one idempotent `{serving, live, name, description}` event whenever that state changes (and re-asserts it on a periodic keep-alive, described below) — `live` meaning `app.meta.json` is present *and* the app answers locally. The backend's `AppReadinessService` is the single owner of per-environment app state: it records identity into `projectApps`, notifies the open workspace over SSE so the app pane appears, and resolves `awaitReady` for whatever publish/duplicate/schedule flow is waiting. The runtime proxy keeps reporting the **down** direction from the real request path, as it already does.

### Why the inotify watch is safe here (cf. ADR-0009)

ADR-0009 rejected an in-pod inotify watch for the *Environment Variables* file because the **backend** writes that file through its own CephFS client, and inotify events do not cross CephFS clients — an in-pod watch fires for agent edits but never for backend edits. App readiness relies on exactly the half that works: the reporter watches `app.meta.json` for the **agent's** in-pod write at go-live. That file does have a second writer — a human *Edit-details* save, which comes from the backend — but the reporter neither sees nor needs it: `updateApp` applies an Edit-details change to `projectApps` and the SSE stream directly. So the ADR-0009 rule still holds — we never depend on inotify to observe a backend-originated write.

## Reliability

Reliability rests on the push, not a backstop probe: at-least-once delivery (agent-control retries until acked), identity persisted in `projectApps` so a backend restart never loses detection, and a startup resync in agent-control. There is one deliberately-accepted gap — a pod its kubelet can reach but the cluster cannot. The properties, and why that gap is acceptable, are in [ADR-0015 § Consequences](adr/0015-app-liveness-pushed-not-polled.md#consequences).

## The 30s keep-alive

`agent-control` re-sends its positive state every 30s, not only on change. This isn't polling and doesn't re-curate App Details — its sole job is to re-assert liveness in the in-memory (ephemeral, per ADR-0015) `AppReadinessService`, so a backend restart — which wipes the map — recovers within one interval. Without it, a stable app emits no push and `awaitReady` would stall after every redeploy.

The cost is linear and trivial at hundreds of apps; the real limit is **multiple backend replicas** (the map isn't shared), not app count. When that comes, move readiness to Redis with a TTL (already used here) — the keep-alive becomes the TTL refresh and silent pod deaths self-expire. Not a Postgres column: a no-TTL boolean would report a long-dead pod as serving.

## Rollout

`agent-control` is a baked binary, so the feature lands only when pods are **recreated onto a new image** — delivered by an empty `requiresPodRecreate` agent-update migration (`20260616_app_readiness_push`), not by a plain version bump. Why a file migration is the right lever for a binary swap is in [ADR-0015 § Consequences](adr/0015-app-liveness-pushed-not-polled.md#consequences).

## Where this lives in code

- In-pod reporter: `packages/opsiforce/proxy/cmd/agent-control/reporter.go` (alongside the `/health`, `/restart-app` server in `main.go`)
- Backend owner: `packages/opsiforce/backend/src/project/app-readiness.service.ts` — the ephemeral per-environment state and `awaitReady`
- Push endpoint: `backend/src/project/app.controller.agent.ts` (`POST gateway/app/state`, `GatewayAuthGuard`)
- Identity row: `projectApps`, written by `AppService.upsertProjectApp` (`backend/src/project/app.service.ts`)
- Down signal: `opsiforce-proxy` failure report (`proxy/internal/server/server.go` → `backend/src/internal`)

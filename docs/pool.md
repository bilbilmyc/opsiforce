# Pending Project Pools

A small pool of fully-provisioned projects sits in `status='pending'` waiting for any tenant to claim them. When a user clicks "New Project", the backend reassigns one of these pre-baked rows to the user's tenant in a fast atomic flip, sidestepping the 30–60s slow path (pod create + image pull + init container + Bifrost API calls).

## Why this exists

The old warm pool kept image-cached pods around but did nothing else — each new project still had to run init containers, seed the workspace, create a Bifrost team, create virtual keys, and wait for OpenCode to start. That meant a 30–60s wait for the user. The pending pool moves all of that work *behind* the user click: pool projects already have a pod up, a workspace seeded, a Bifrost team attached, and OpenCode running. Claim updates tenant ownership and Bifrost budgets in place instead of creating fresh resources.

## What's in a pending project

Each pool slot is a complete project, less the user's identity:

- a `projects` row with `tenant_id=NULL`, `status='pending'`, an `agent_id`, and a `directory` of `projects/{id}`
- a Bifrost **orphan team** (no `customer_id`) with chat + backend virtual keys
- a `project_virtual_keys` row per key with `tenant_id=NULL`
- a `project_gateway_keys` row with `tenant_id=NULL`
- a running Kubernetes pod with the workspace seeded and OpenCode reachable

No LLM call ever happens against a pool project before it is claimed, so the cost ledger has nothing to misattribute — attribution becomes meaningful from the team-PATCH moment onward.

## Pool size

Each agent in `agent-config/agents.json` declares its own `poolSize` and pod model. Today only `app-builder` declares a pool (default `3`). Setting `poolSize: 0` disables the pool for that agent. Setting `POOL_SIZE_OVERRIDE` in the environment caps every agent's effective size — local dev uses `1`, and operators can set it to `0` as a global kill switch without rebuilding the image.

## Lifecycle

```
boot ─► sweep legacy warm pods (one-time)
     ─► recover stuck `claiming` rows
     ─► integrity check (pod present & healthy for each pending project)
     ─► recycle pending projects whose baked agent template or model is stale
     ─► replenish to target per agent

new project click:
     ─► claim atomically: reserve a `pending` row via FOR UPDATE SKIP LOCKED,
        flip to `claiming`, PATCH Bifrost budgets to the tenant defaults,
        PATCH Bifrost team's customer_id, write tenant_id onto VK / gateway
        rows, flip to `active`
     ─► return the ready project (~100–500ms)
     ─► async replenish for the claimed agent
```

A pool project whose pod runtime breaks (missing in K8s, stuck in `ImagePullBackOff`, missing Bifrost team) is **recycled**: pod deleted, Bifrost resources revoked, workspace removed, DB row deleted, and a fresh slot created in its place.

Pool projects are recycled when the baked workspace agent version or model is stale. The regular `AgentUpdateService` sweep skips unclaimed pool slots because its migration job would mount the same workspace as the live pool pod; claimed projects still migrate normally after they become `active`.

## Recovery

The claim flow has a narrow window between "flipped to claiming" and "Bifrost team patched" where a backend crash leaves a row stuck in `claiming`. A background worker scans for `claiming` rows older than 30 seconds every minute. It re-attempts the Bifrost PATCH, verifies the team assignment when retries fail, and only returns a clean orphan team to `pending`. If the team may already be tenant-attributed, the slot is destroyed and replaced.

If the Bifrost PATCH fails permanently during the synchronous claim, the user falls through to the slow path. No user-visible error.

## When the pool is bypassed

- The pool for the requested agent is empty (boot still warming up, recent burst of claims, or `poolSize=0`).
- The Bifrost budget or team patch fails three times in a row (clean slots return to pending; ambiguous slots are destroyed; user uses the slow path).

In every bypass case the existing slow path runs unchanged.

## Operating it

Check current depth:
```
SELECT agent_id, status, count(*)
FROM projects
WHERE status IN ('pending', 'claiming')
GROUP BY agent_id, status;
```

Drain a pool: set `poolSize: 0` in `agent-config/agents.json` and ship a new backend image. Existing pool slots will be claimed naturally; no new ones are created.

Global drain without an image bump: set `POOL_SIZE_OVERRIDE=0` via Helm.

## Code pointers

- `backend/src/pool/project-pool.service.ts` — pool lifecycle (boot, claim, replenish, recycle, recovery)
- `backend/src/bifrost/bifrost.service.ts` — `createOrphanProjectResources` + `reassignTeamCustomer`
- `backend/src/project/project.service.ts` — `create()` tries the pool first, falls back to `createDirect()`
- `agent-config/agents.json` — per-agent `poolSize` and model

# Agent Updates

Agent updates keep persisted project workspaces aligned with the current agent without waiting for a pod restart. Two distinct things travel through the same pipeline:

1. **Agent-owned files** — OpenCode config, the agent prompt, and skills. Replaced wholesale on every reconcile.
2. **Workspace migrations** — one-shot scripts (e.g. `bun → yarn pnp`) applied once per project, guarded by managed checksums so a user/agent edit isn't silently overwritten.

## Scope: existing workspaces only

This system is for projects that were initialized at an older agent template version and need to catch up. **New pods do not need it**: when a project is first created (or its pod is reassigned), the pod's init container in `pod.template.ts` copies the latest agent-owned files and the app template directly from the agent image, then runs `agent-workspace-migrate --seed-baseline` to write a ledger entry at the current template version. The next sweep reads that ledger via `workspaceAtTarget()` and silently skips the project because there's nothing to do.

The migrate K8s job is therefore only useful for **long-running pods that were started before a template version bump**. Their workspace volume holds older skills/prompt/template artifacts; the migrate job rewrites them, then either `dispose` or pod recreate brings the runtime in sync.

## Versions

There are two distinct versions in this system that should not be conflated:

- **Agent container image** — the docker image running the agent pod. Set via `AGENT_CONTAINER_IMAGE` env / `agentContainerImage` config. Tagged from `agent-config/agent-image-version.json` in local dev or by CI in prod. Bumps every time we rebuild the image (Dockerfile change, dep bump, etc.).
- **Agent template version** — the `version` field for each agent in `agent-config/agents.json`. Source of truth for "is this workspace up to date?" Bumps only when the agent's behavior changes (prompt, skills, breaking workspace migration).

The backend reads the template version directly from `agent-config/agents.json`. The same registry is baked into the agent container image at `/opt/agents/agents.json` so the in-pod migrate script resolves the same version when writing the workspace ledger.

## Trigger

The only trigger today is **backend bootstrap**: `AgentUpdateService.onApplicationBootstrap()` enqueues one BullMQ `sweep` job. The sweep reads every project from the DB, checks its workspace ledger, and enqueues BullMQ `project` jobs only for projects whose ledger is missing or behind the target template version. Stable jobIds (`project:<agent>:<version>:<projectId>`) deduplicate concurrent project enqueues.

There is no admin HTTP endpoint and no scheduled task — the deploy itself is the trigger. Bumping the agent's `version` in `agent-config/agents.json` rolls out a new backend image, the new pod boots, and the boot sweep enqueues updates for drifted projects. The project processor still re-checks the workspace ledger before doing any work, so a project that catches up between sweep and processing silently no-ops.

## Flow

The sweep job:

- reads projects from the DB,
- checks each workspace ledger (`<storageMount>/<directory>/.opsiforce/agents/<agent>.json`),
- enqueues `project` jobs only for projects whose `agentVersion` does not match the target.

Each project job:

- pre-flights against the workspace ledger (`<storageMount>/<directory>/.opsiforce/agents/<agent>.json`) and skips if `agentVersion` already matches target,
- inserts a `running` row in `project_agent_updates`,
- creates a short-lived Kubernetes Job from the agent container image, mounting the workspace at `/workspace`,
- the Job runs `agent-workspace-migrate`, which replaces agent-owned files, applies pending migrations, writes the new ledger and a structured `<agent>.summary.json`,
- backend reads that summary file from the shared workspace volume and records outcome on the row.

## Reload — dispose vs pod recreate

The migration writes the workspace; running pods are not interrupted by that. If the runtime needs to pick up changes, the backend defers via the `reload_pending` status and reconciles when safe.

The recovery cost depends on what changed:

| Change | Flag set | Recovery |
|---|---|---|
| Agent-owned files (skills, prompt, opencode.json) | `requiresOpenCodeReload` | `POST /instance/dispose?directory=/workspace` — cheap, reuses pod |
| Workspace migration that changes template files (package manager, lockfile, build system) | `requiresPodRecreate` | reassign pod — expensive, only when needed |

Workspace migrations declare `requiresPodRecreate: true` in their `migration.json` only when the change can't be picked up by a running pod (e.g., the bun→yarn-pnp migration rewrites lockfiles and adds `.pnp.cjs`). Agent-only changes never trigger pod recreation.

The app processes inside the pod (`app-backend`, `app-frontend`) are wrapped in `agent-config/scripts/guard.sh`, which restarts them autonomously on crash with exponential backoff. The platform's reload mechanism does not need to restart user-space app processes — guard.sh handles that side. The platform only intervenes for state guard.sh can't reach: OpenCode's in-memory config cache (`dispose`) and container-level state like installed `node_modules` from a different package manager (pod recreate).

If the OpenCode session is busy, the row stays `reload_pending` and a reload-only retry job re-fires after 5 / 15 / 30 / 60 minutes. Transient errors (dispose returns 500, pod recreate fails) also defer instead of marking the row terminal — the system self-heals from blips. Bull Board shows the retry trail.

A reload is also attempted opportunistically the next time the agent surface is proxied to — so the next idle agent request sees the refreshed config without waiting for the next backoff tick.

## Status

`project_agent_updates.status` has five values (no `queued` — BullMQ owns queue state):

- `running` — K8s job in flight
- `reload_pending` — migration applied to disk, runtime reload deferred
- `applied` — done
- `conflict` — at least one operation hit a managed-checksum mismatch
- `failed` — the K8s job itself didn't return cleanly (terminal, admin attention)

## Database migrations

The backend's database migrations must run before the backend starts. Production Helm enables `npmMigrationJob` as a `pre-install,pre-upgrade` hook running `yarn run db:migrate` to create the `agents` and `project_agent_updates` tables before bootstrap enqueueing fires.

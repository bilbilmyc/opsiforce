# Agent Updates

> How persisted project workspaces are brought in line with a newer agent profile without waiting for a pod restart. Read this to understand why bumping an agent's `version` rolls out to existing projects.

A workspace is seeded from the agent image when its pod is first created, then lives independently on storage. When the agent profile changes (new skills, a new prompt, a breaking template migration), long-running workspaces fall behind. Agent Updates is the pipeline that catches them up. Two distinct things travel through it:

1. **Agent-owned files** — OpenCode config, the agent prompt, and skills. Replaced wholesale on every reconcile.
2. **Workspace migrations** — one-shot scripts (e.g. `bun → yarn-pnp`) applied once per project, guarded by managed checksums so a user/agent edit isn't silently overwritten.

## Scope: existing workspaces only

A freshly created or reassigned pod copies the latest profile from the image directly (in the init container) and writes a ledger entry at the current template version — so the next sweep sees it's already current and skips it. The migrate job therefore matters only for **long-running pods started before a version bump**: their volume holds older artifacts, the job rewrites them, and a reload brings the runtime in sync.

## Two versions, not to be conflated

- **Agent container image** — the Docker image the pod runs. Bumps on any image rebuild (Dockerfile, dep bump). Tagged from `agent-config/agent-image-version.json` locally, by CI in prod.
- **Agent template version** — the `version` field per agent in `agent-config/agents.json`. The source of truth for "is this workspace up to date?" Bumps only when behaviour changes. The backend reads it from `agents.json`; the same registry is baked into the image so the in-pod migrate script resolves the same target.

## Trigger and flow

The only trigger is **backend bootstrap** — there is no admin endpoint and no cron. `AgentUpdateService.onApplicationBootstrap` enqueues one BullMQ `sweep`; the sweep reads every project, checks its workspace ledger, and enqueues a `project` job only for those behind the target (stable jobIds dedupe concurrent enqueues). So bumping an agent's `version` ships a new backend image, whose boot sweep rolls the change out to drifted projects. Each project job re-checks the ledger (a project that caught up in between no-ops), then runs a short-lived Kubernetes Job from the agent image that replaces agent-owned files, applies pending migrations, and writes the new ledger plus a summary the backend records on a `project_agent_updates` row.

## Reload: dispose vs. pod recreate

Writing the workspace doesn't interrupt a running pod; the runtime picks up changes via the `reload_pending` status, reconciled when safe. The cost depends on what changed:

- **Agent-owned files** (skills, prompt, `opencode.json`) → `POST /instance/dispose` — cheap, reuses the pod, clears OpenCode's in-memory config cache.
- **Template files** that a running pod can't absorb (package manager, lockfile, build system) → pod recreate — declared by `requiresPodRecreate: true` in the migration.

The app's own processes are wrapped by `guard.sh`, which revives them on crash, so the platform only intervenes for state guard can't reach (OpenCode's config cache, or container-level state like a different package manager's `node_modules`). A busy session or a transient error defers (the row stays `reload_pending` and a retry re-fires on a backoff schedule) rather than failing terminally, and the next idle agent request triggers an opportunistic reload. Row statuses: `running`, `reload_pending`, `applied`, `conflict` (a managed-checksum mismatch), `failed` (the Job itself didn't return cleanly — terminal).

## See also

- [Agents](agent-system.md) — what an agent profile contains and how the init container seeds a fresh workspace.
- [Pod Lifecycle](../runtime/pod-lifecycle.md) — what a pod recreate entails.
- Code: `backend/src/agent-update/` (service, sweep + project processors), `agent-config/agents.json` (`version`), the in-pod `agent-workspace-migrate` script, and per-migration `migration.json` (`requiresOpenCodeReload` / `requiresPodRecreate`).

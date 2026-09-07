# Agent Updates

> How persisted project workspaces are brought in line with a newer agent profile without waiting for a pod restart. Read this to understand why bumping an agent's `version` rolls out to existing projects.

A workspace is seeded from the agent image when its pod is first created, then lives independently on storage. When the agent profile changes (new skills, a new prompt, a breaking template migration), long-running workspaces fall behind. Agent Updates is the pipeline that catches them up. Two distinct things travel through it:

1. **Agent-owned files** — OpenCode config, the agent prompt, and skills. Replaced wholesale on every reconcile.
2. **Workspace migrations** — one-shot scripts (e.g. `bun → yarn-pnp`) applied once per project, guarded by managed checksums so a user/agent edit isn't silently overwritten.

## Scope: existing workspaces only

A freshly created or reassigned pod copies the latest profile from the image directly (in the init container) and writes a ledger entry at the current template version — so the next sweep sees it's already current and skips it. The migrate job therefore matters only for **long-running pods started before a version bump**: their volume holds older artifacts, the job rewrites them, and opencode's file watcher brings the runtime in sync.

The sweep targets **default environments only**. A published environment's workspace still gets current agent-owned files from the init-container sync at its next publish-driven pod start, but migrations never run there — a bounded consequence recorded in [ADR-0024](../adr/0024-agent-opencode-config-lives-in-the-workspace-opencode-dir.md): after the config relocation, a published environment's pod loads both the relocated config and the never-deleted legacy file. Harmless because both files carry the same settings.

## Two versions, not to be conflated

- **Agent container image** — the Docker image the pod runs. Bumps on any image rebuild (Dockerfile, dep bump). Tagged from `agent-config/agent-image-version.json` locally, by CI in prod.
- **Agent template version** — the `version` field per agent in `agent-config/agents.json`. The source of truth for "is this workspace up to date?" Bumps only when behaviour changes. The backend reads it from `agents.json`; the same registry is baked into the image so the in-pod migrate script resolves the same target.

## Trigger and flow

The only trigger is **backend bootstrap** — there is no admin endpoint and no cron. `AgentUpdateService.onApplicationBootstrap` enqueues one BullMQ `sweep`; the sweep reads every project, resolves that project's own agent (via `projects.agent_id` and the merged public + private registry), checks the workspace ledger kept under that agent's name against that agent's template version, and enqueues a `project` job only for those behind the target (stable jobIds dedupe concurrent enqueues). The whole downstream pipeline — job identity, ledger reads and writes, migration discovery, agent-file installation — is keyed by the resolved agent, so a private-agent project is never processed under the default agent's identity. A project whose agent is missing from the merged registry is skipped and logged, not updated under a wrong identity. So bumping an agent's `version` ships a new backend image, whose boot sweep rolls the change out to drifted projects. Each project job re-checks the ledger (a project that caught up in between no-ops), then runs a short-lived Kubernetes Job from the agent image that replaces agent-owned files, applies pending migrations, and writes the new ledger plus a summary the backend records on a `project_agent_updates` row.

## Reload: file watcher vs. pod recreate

Writing the workspace doesn't interrupt a running pod. What happens next depends on what changed:

- **Agent-owned files** (skills, prompt, `opencode.json`) need no reload call at all. OpenCode v2 watches every config root it discovered, `/workspace/.opencode/` included, and rebuilds config, agents, skills and plugins when a file under it changes (about two seconds end to end). The Job writes the files; that is the reload. Verified 2026-09-04 by running the migrate script against a changed profile and observing the new system prompt, a new skill and a new model variant through the API and in a live model reply, with the opencode process id unchanged ([ADR-0030](../adr/0030-agent-owned-file-changes-need-no-opencode-reload.md)).
- **Template files** that a running pod can't absorb (package manager, lockfile, build system) and anything baked into the image or the pod spec (the opencode binary, environment variables) → pod recreate — declared by `requiresPodRecreate: true` in the migration.

History: on opencode 1.x the runtime cached config and agents in memory with no file watching, so the pipeline had to call `POST /instance/dispose` after writing; v2 removed that route and briefly the pipeline restarted the opencode process through agent-control instead, at the cost of a few seconds of downtime per project. Both are gone.

The app's own processes are wrapped by `guard.sh`, which revives them on crash, so the platform only intervenes for container-level state guard can't reach (a different package manager's `node_modules`, a new image). A busy session or a transient error defers a pending pod recreate (the row stays `reload_pending` and a retry re-fires on a backoff schedule) rather than failing terminally, and the next idle agent request triggers an opportunistic retry. Row statuses: `running`, `reload_pending`, `applied`, `conflict` (a managed-checksum mismatch), `failed` (the Job itself didn't return cleanly — terminal).

## See also

- [Agents](agent-system.md) — what an agent profile contains and how the init container seeds a fresh workspace.
- [Pod Lifecycle](../runtime/pod-lifecycle.md) — what a pod recreate entails.
- Code: `backend/src/agent-update/` (service, sweep + project processors), `agent-config/agents.json` (`version`), the in-pod `agent-workspace-migrate` script, and per-migration `migration.json` (`requiresPodRecreate`).

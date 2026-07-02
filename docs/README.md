# Opsiforce Documentation

> The documentation index. New here? Start with [Overview](overview.md) for the narrative. Domain vocabulary is in [CONTEXT.md](../CONTEXT.md); the *why* behind decisions is in the [ADRs](adr/README.md). Docs are narrative orientation — code is the reference. When you add or change a significant feature, add or update its doc here.

**Orientation & dev**
- [Overview](overview.md) — system diagram, the source-level OpenCode integration, package map
- [Quickstart](quickstart.md) — what `yarn dev` does (macOS-only): the numbered steps, the two LLM choices, `--reset`, day-two re-runs, and the pinned-versions manifest
- [Commands](development/commands.md) — type-check, lint, database, local ports (setup lives in [../README.md](../README.md))
- [Local Orchestration](development/local-orchestration.md) — how `yarn dev` brings the stack up: the privileged tunnel, Tilt as the one-UI process orchestrator (in-cluster + host), and the static dev identity that lands you signed in
- [Deployment](development/deployment.md) — CI/CD, the deploy-order dependency chain, rollout strategy

**Runtime** (`runtime/`)
- [Request Flows](runtime/request-flows.md) — runtime-proxy topology, the shared ensure gate, per-surface routing
- [Pod Lifecycle](runtime/pod-lifecycle.md) — K8s-authoritative pod state, the status model, recovery, suspension
- [Pods](runtime/pods.md) — the read-only operational view of running pods ([ADR-0013](adr/0013-pods-view-reads-live-keepalive-from-redis.md))
- [Pending Project Pools](runtime/pool.md) — pre-baked projects for instant `New Project` claim
- [Persistence](runtime/persistence.md) — what survives a pod swap, XDG layout, resume, workspace cleanup
- [Resources](runtime/resources.md) — per-project pod CPU/memory class ([ADR-0005](adr/0005-pod-class-project-level-snapshot.md))
- [Pod Tools](runtime/pod-tools.md) — the embedded VS Code (code-server) and DB viewer (Datasette)

**Projects & apps** (`projects/`)
- [Project Environments](projects/environments.md) — the Project/Environment/publish model ([ADRs](adr/README.md))
- [Project Duplication](projects/duplication.md) — copy a project with working state ([ADR-0011](adr/0011-duplication-reuses-git-publish-path.md))
- [Project Export & Import](projects/export-import.md) — carry a project to another deployment as a file ([ADR-0017](adr/0017-project-export-is-a-faithful-full-workspace-zip.md))
- [Project Apps](projects/project-apps.md) — per-environment app identity, the catalog pin, editing ([ADR-0016](adr/0016-app-details-are-per-environment.md))
- [App Readiness](projects/app-readiness.md) — go-live/serving pushed from the pod, not polled ([ADR-0015](adr/0015-app-liveness-pushed-not-polled.md))
- [Schedules](projects/schedules.md) — per-environment agent-requested cron, wake-on-fire
- [File Downloads](projects/file-downloads.md) — downloading workspace files from chat
- [Dictation](projects/dictation.md) — voice input for the chat prompt, and why transcription is pinned to the real OpenAI provider

**Agents** (`agents/`)
- [Agents](agents/agent-system.md) — agent profiles, how they reach a workspace, the model ([ADR-0008](adr/0008-agent-model-owned-by-agent-config.md))
- [Agent Updates](agents/agent-updates.md) — keeping persisted workspaces aligned with a newer profile

**Gateways** (`gateways/`)
- [LLM Gateway](gateways/llm-gateway.md) — Bifrost, per-project virtual keys, budget hierarchy ([ADR-0003](adr/0003-one-bifrost-team-per-project-keys-per-env.md))
- [Codex Proxy](gateways/codex-proxy.md) — the host-run subscription bridge that serves the standalone local LLM ([ADR-0018](adr/0018-standalone-llm-access-via-codex-proxy.md))
- [Service Gateway](gateways/service-gateway.md) — per-project credential isolation for non-LLM external services
- [Request Logging](gateways/request-logging.md) — per-project Off/Metadata/Full traffic logging ([ADR-0006](adr/0006-request-log-streaming-tee.md))

**Organization admin** (`organization/`)
- [Settings](organization/settings.md) — the configuration surface (rail of gated sections) ([ADR-0014](adr/0014-admin-section-and-operational-view-module.md))
- [Admin](organization/admin.md) — the operational sibling (configure vs operate)
- [Permissions](organization/permissions.md) — Keycloak RBAC, why frontend gating ≠ enforcement, adding a permission
- [Workspaces](organization/workspaces.md) — grouping projects, the membership-vs-permission visibility model
- [Defaults](organization/defaults.md) — two-tier timeout/budget defaults (and what they exclude)
- [Integrations](organization/integrations.md) — the managed-auth external tenant-name mapping (`tenant_settings`)

**Frontend** (`frontend/`)
- [Query Adapter](frontend/query-adapter.md) — why reads use the in-house `createAppQuery` wrapper
- [Job Dock](frontend/job-dock.md) — one global progress surface for publish, duplicate, export, and import

**Decisions** (`adr/`)
- [Architecture Decision Records](adr/README.md) — the indexed *why* behind the above

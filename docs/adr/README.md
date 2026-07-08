# Architecture Decision Records

> The durable record of *why* Opsiforce is shaped the way it is. Each ADR captures one decision — its context, the choice, the alternatives rejected, and the consequences. Prose docs in `../` link here rather than restating rationale.

Format: Title / Status / Context + Decision / Considered options / Consequences. ADRs are append-only — a later decision that changes an earlier one is a new ADR that supersedes it (noted in both).

| # | Decision | Notes |
|---|----------|-------|
| [0001](0001-environment-vs-project-environment.md) | Two entities for environments: tenant `Environment` registry vs per-project `ProjectEnvironment` | foundation of [environments.md](../projects/environments.md) |
| [0002](0002-development-environment-reuses-project-id.md) | The Development `ProjectEnvironment` reuses the `Project`'s id | partially superseded by 0012 |
| [0003](0003-one-bifrost-team-per-project-keys-per-env.md) | One Bifrost team per project; one virtual-key pair shared across its environments | → [llm-gateway.md](../gateways/llm-gateway.md) |
| [0004](0004-git-based-incremental-publish.md) | Publish via git: a published environment is a checkout of the dev repo | → [environments.md](../projects/environments.md) |
| [0005](0005-pod-class-project-level-snapshot.md) | Pod class (Resources) is project-level policy, snapshotted as numbers | → [resources.md](../runtime/resources.md) |
| [0006](0006-request-log-streaming-tee.md) | Request-log capture streams and tees a bounded prefix; verbosity is a separate policy | → [request-logging.md](../gateways/request-logging.md) |
| [0007](0007-per-environment-app-auth.md) | App Auth is enforced per `ProjectEnvironment`, seeded once from Development | partially superseded by 0012 |
| [0008](0008-agent-model-owned-by-agent-config.md) | Agent model is owned by agent-config, not a tenant/platform default | → [defaults.md](../organization/defaults.md), [agent-system.md](../agents/agent-system.md) |
| [0009](0009-in-pod-control-process.md) | App restarts go through an in-pod control process, not exec or file-watching | → [environments.md](../projects/environments.md) |
| [0010](0010-app-identity-read-at-runtime.md) | App identity is read at runtime, not hardcoded by the agent | → [project-apps.md](../projects/project-apps.md) |
| [0011](0011-duplication-reuses-git-publish-path.md) | Duplication reuses the publish git path plus a subtractive runtime-state copy | → [duplication.md](../projects/duplication.md) |
| [0012](0012-public-app-hostnames-carry-environment-slug.md) | Public app hostnames carry an immutable Environment slug | supersedes parts of 0002 & 0007 |
| [0013](0013-pods-view-reads-live-keepalive-from-redis.md) | The Pods view reads keep-alive live from Redis, not from k8s or a new store | → [pods.md](../runtime/pods.md) |
| [0014](0014-admin-section-and-operational-view-module.md) | Operational views live in an "Admin" section and their own backend module | → [admin.md](../organization/admin.md) |
| [0015](0015-app-liveness-pushed-not-polled.md) | App liveness is pushed from the pod over the gateway channel, not polled | → [app-readiness.md](../projects/app-readiness.md); has a 2026-06-17 amendment |
| [0016](0016-app-details-are-per-environment.md) | App Details are per-environment; each `ProjectEnvironment` is its own App | implemented (migration 0047) → [project-apps.md](../projects/project-apps.md) |
| [0017](0017-project-export-is-a-faithful-full-workspace-zip.md) | A Project export is a faithful full-workspace zip, not a sanitized or rebuilt bundle | design — not yet implemented → [export-import.md](../projects/export-import.md) |
| [0018](0018-standalone-llm-access-via-codex-proxy.md) | standalone local LLM runs through a host Codex-subscription proxy (BYO-key alternative) | implemented → [Quickstart](../quickstart.md) |
| [0019](0019-externally-deleted-pods-recreated-eagerly.md) | Externally deleted pods are recreated eagerly — boot sweep + delete-event watcher | accepted — boot sweep implemented, delete-event watcher pending; amends the lazy-recovery trade-off in [pod-lifecycle.md](../runtime/pod-lifecycle.md) |
| [0020](0020-agent-status-pushed-and-resynced-not-heartbeated.md) | Agent Status is pushed from the pod and re-synced at boundaries — no heartbeat, no persistence | implemented (self-healing) → [agent-status.md](../agents/agent-status.md) |
| [0021](0021-sidebar-orders-by-last-prompt.md) | The project sidebar orders by a new `last_prompt_at` (user sends only), not keep-alive `last_active_at` | implemented (migration 0053) |
| [0022](0022-environment-identity-color.md) | Environment identity color: a stored registry attribute, distinct from status color | implemented (migration 0054); builds on [0001](0001-environment-vs-project-environment.md) |

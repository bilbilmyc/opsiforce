# Persistence & Storage

Database state, persistent storage, and how projects survive pod replacement.

---

## Database schema

### `projects`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Project UUID |
| `tenant_id` | text FK | Owning tenant |
| `title` | text | Optional user title |
| `description` | text | Optional user description |
| `directory` | text | Persistent workspace subPath. New projects use `projects/{projectId}`; rows created before the pending-pool migration retain `projects/{tenantId}/{projectId}`. |
| `status` | enum | `starting`, `active`, `suspended`, `disabled`, `failed`, `pending`, `claiming` (the last two are pool-only; see [Pending Project Pools](pool.md)) |
| `pod_ip` | text | Cached pod IP for routing. Verified against the informer on the active fast path and against Kubernetes on proxy failure; the cluster is authoritative. |
| `session_id` | text | Reserved column, not used for resume in the current flow |
| `platform_version` | text | Agent platform version recorded at create time |
| `last_active_at` | timestamp | Last observed user activity |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

The assigned pod's name is **not** persisted — it is derived as `opsiforce-agent-{projectId.slice(0,8)}` whenever needed. Pod lifecycle state (warm pool, container readiness, restart counts) is read directly from Kubernetes via labels and pod status. See [Pod Management](pod-management.md) for the rationale.

### `project_settings`

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | text PK/FK | Owning project |
| `timeout_idle` | bigint | Agent TTL stored in milliseconds |
| `app_timeout_idle` | bigint | App/VS Code TTL stored in milliseconds |

### `deleted_projects`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Original project UUID |
| `tenant_id` | text | Tenant that owned the project |
| `directory` | text | Workspace subPath at time of deletion |
| `deleted_at` | timestamp | When the project was deleted |

Tombstone table for workspace cleanup. When a project is deleted, a row is inserted here. A daily BullMQ job removes the workspace directory after 7 days and deletes the tombstone row.

### `project_virtual_keys`

Stores Bifrost virtual keys per project when Bifrost is enabled.

### `tenant_budget_config`

Stores Bifrost customer ID and budget config per tenant (1:1 with `tenants`).

### `project_budget_config`

Stores Bifrost team ID and budget config per project (1:1 with `projects`).

---

## Storage backends

### Cluster deployments

- CephFS PVC
- `ReadWriteMany`
- pod mounts project data with `subPath` equal to the stored `directory` (new: `projects/{projectId}`; legacy: `projects/{tenantId}/{projectId}`)

### Local minikube

- `hostPath` at `/workspace-data` inside the minikube node (same as `storageMountPath` — single path, no host/container translation)
- same `subPath` layout
- backend runs in-cluster (deployed via Tilt) and mounts the same hostPath as agents, so the backend and agents see identical bytes — no host bind mount, no cross-VM sync layer to fail
- file ops in `upload`, `duplication`, and `cleanup` all happen pod-side, against the shared volume

Both modes preserve project data across pod deletion and recreation.

---

## What actually persists

The persistent workspace contains:

- OpenCode session database
- session diffs and app files
- `.opencode` agent and skill files
- XDG config, cache, and state
- code-server settings and extensions
- uploaded files and generated app output

This is why a project can survive pod timeout, external pod deletion, and backend restart.

---

## XDG paths

The pod template redirects XDG state into the mounted workspace:

```text
XDG_DATA_HOME=/workspace/.xdg/share
XDG_CONFIG_HOME=/workspace/.xdg/config
XDG_CACHE_HOME=/workspace/.xdg/cache
XDG_STATE_HOME=/workspace/.xdg/state
```

Without these overrides, OpenCode session state would stay in ephemeral container storage and disappear with the pod.

---

## Pod replacement flow

When a project pod is replaced:

```
1. Old pod disappears
2. The persistent project subPath stays intact
3. Opsiforce creates a new assigned pod with the same deterministic name and subPath
4. OpenCode starts against the persisted workspace and XDG directories
5. Backend caches the new pod IP and flips the project to active
6. Frontend reconnects to the latest updated root session
```

The project identity is stable even though the pod identity changes.

---

## What persists vs. what does not

| Persists | Does not persist |
|----------|------------------|
| chat history and session DB | in-memory process state |
| files under `/workspace` | active PTY sessions |
| agent config copied onto the workspace | temporary files outside `/workspace` |
| VS Code settings and extensions | live network connections |
| uploaded files | in-flight HTTP streams |

---

## Resume behavior

Resume is frontend-owned in the current implementation.

```
1. Frontend asks the agent for sessions
2. Child sessions are ignored
3. Root sessions are sorted by updated time
4. The newest root session is opened
5. If no root session exists, frontend opens the default new-session route
```

Opsiforce does not currently use `projects.session_id` as the resume source of truth.

---

## Workspace cleanup

When a project is deleted, its workspace directory is not removed immediately. Instead, a tombstone row is inserted into `deleted_projects` with the current timestamp.

A daily BullMQ job (`workspace-cleanup` queue, 3 AM cron) handles cleanup in two phases:

1. **Expired workspaces** — tombstones older than 7 days: remove the workspace directory from storage, then delete the tombstone row. Empty tenant directories are removed afterward.
2. **Orphaned workspaces** — directories on disk that have no matching row in `projects` or `deleted_projects`: removed immediately.

The 7-day retention allows recovery of workspace data in case of accidental deletion.

The queue dashboard is available at `/api/admin/queues` (requires `can_view_queue_dashboard` permission).

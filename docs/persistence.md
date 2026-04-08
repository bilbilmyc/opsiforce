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
| `directory` | text | Persistent workspace subPath: `projects/{tenantId}/{projectId}` |
| `status` | enum | `starting`, `active`, `suspended` |
| `pod_name` | text | Current assigned pod name, null when suspended |
| `pod_ip` | text | Current pod IP when routing directly |
| `session_id` | text | Reserved column, not used for resume in the current flow |
| `platform_version` | text | Agent platform version recorded at create time |
| `last_active_at` | timestamp | Last observed user activity |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

### `project_settings`

| Column | Type | Description |
|--------|------|-------------|
| `project_id` | text PK/FK | Owning project |
| `timeout_idle` | bigint | Agent TTL stored in milliseconds |
| `app_timeout_idle` | bigint | App/VS Code TTL stored in milliseconds |

### `pods`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text PK | Pod row UUID |
| `pod_name` | text UNIQUE | Kubernetes pod name |
| `status` | enum | `warm`, `assigned`, `terminating` |
| `project_id` | text FK | Owning project for assigned pods |
| `pod_ip` | text | Last known pod IP |
| `created_at` | timestamp | Creation time |
| `updated_at` | timestamp | Last update |

### `project_api_keys`

Stores Bifrost virtual keys per project when Bifrost is enabled.

---

## Storage backends

### Cluster deployments

- CephFS PVC
- `ReadWriteMany`
- pod mounts project data with `subPath = projects/{tenantId}/{projectId}`

### Local minikube

- `hostPath`
- same `subPath` layout
- data lives on the minikube VM disk

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
3. Opsiforce creates a new assigned pod with the same subPath
4. OpenCode starts against the persisted workspace and XDG directories
5. Backend updates podName / podIp and marks the project active
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

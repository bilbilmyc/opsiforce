# Persistence & Storage

Database schema, storage backends, and session persistence across pod switches.

---

## Database Schema (Drizzle ORM + PostgreSQL)

### projects table

| Column | Type | Description |
|--------|------|-------------|
| id | text PK | UUID |
| title | text | User-provided name (nullable) |
| description | text | Optional context (nullable) |
| directory | text | CephFS subPath: "projects/{id}" |
| status | enum | pending, active, suspended |
| pod_name | text | Current K8s pod name (null when suspended/stopped) |
| pod_ip | text | Current pod cluster IP |
| session_id | text | opencode session ID for resume |
| platform_version | text | Agent platform version at creation — bumped when agent changes (#1477) |
| last_active_at | timestamp | Last user interaction |
| created_at | timestamp | Project creation time |
| updated_at | timestamp | Last update |

### pods table

| Column | Type | Description |
|--------|------|-------------|
| id | text PK | UUID |
| pod_name | text UNIQUE | K8s pod name |
| status | enum | warm, assigned, terminating |
| project_id | text FK→projects | null if warm |
| pod_ip | text | Cluster IP |
| created_at | timestamp | Pod creation |
| updated_at | timestamp | Last update |

### project_api_keys table

Stores Bifrost virtual keys per project. See [LLM Gateway](llm-gateway.md).

| Column | Type | Description |
|--------|------|-------------|
| id | text PK | UUID |
| project_id | text FK→projects (CASCADE) | Project this key belongs to |
| tenant_id | text FK→tenants | Tenant for aggregation queries |
| bifrost_key_id | text | Bifrost virtual key ID (for Admin API calls) |
| bifrost_key_token | text | Virtual key value (injected into pods as OPENAI_API_KEY) |
| status | text | active, revoked |
| created_at | timestamp | Key creation |
| updated_at | timestamp | Last update |

Index: `(tenant_id, status)` for tenant usage queries. FK on `project_id` uses `ON DELETE CASCADE` — rows auto-deleted when the project is deleted.

---

## Storage

### Production (CloudFleet cluster)
- **CephFS PVC** (`opsiforce-cephfs`) — ReadWriteMany
- StorageClass: `ceph-filesystem` (rook-ceph operator)
- Each agent pod mounts with `subPath: "projects/{project-id}"`
- Data persists across pod restarts/deletions

### Local dev (minikube)
- **hostPath** volume at `/data/opsiforce/`
- Same subPath pattern
- Data lives on minikube VM disk
- Inspect via: `minikube ssh "ls /data/opsiforce/projects/"`

---

## Session Persistence & Pod Portability

A project's session **survives pod deletion, restarts, and reassignment to a different pod**. This is the core persistence guarantee of Opsiforce.

### How it works

Session state is decoupled from pod identity through three layers:

```
Layer 1 — Filesystem (CephFS / hostPath)
  └── /workspace/.xdg/share/opencode/opencode.db  ← SQLite DB (sessions, messages, chat history)
  └── /workspace/.xdg/share/opencode/storage/      ← Session diffs
  └── /workspace/.xdg/config/opencode/             ← User config
  └── /workspace/.xdg/code-server/user-data/        ← VS Code settings, keybindings, UI state
  └── /workspace/.xdg/code-server/extensions/      ← VS Code installed extensions
  └── /workspace/.opencode/                        ← Project-level config (agent.md, plugins)
  └── /workspace/...                               ← Working directory (cloned repos, user files)
  Mounted via subPath: "projects/{project-id}" — survives pod deletion

Layer 2 — Database (PostgreSQL)
  └── projects table      ← project status, directory path, current pod assignment
  └── pods table          ← pod status, pool membership

Layer 3 — Activity tracking (Redis)
  └── opsiforce:timeout:{projectId}  ← TTL key, touched on every proxied request
```

### XDG env vars (critical for persistence)

OpenCode stores its session database in `$XDG_DATA_HOME/opencode/opencode.db` (SQLite). By default, `XDG_DATA_HOME` points to `~/.local/share/` — **ephemeral container storage** that dies with the pod.

The pod template sets these env vars to redirect all XDG directories to the persistent volume:

```
XDG_DATA_HOME=/workspace/.xdg/share     → opencode.db, session diffs, auth tokens
XDG_CONFIG_HOME=/workspace/.xdg/config  → opencode.json (model/provider config), AGENTS.md
XDG_CACHE_HOME=/workspace/.xdg/cache    → model lists, LSP server binaries, npm cache
XDG_STATE_HOME=/workspace/.xdg/state    → logs
```

Without these, sessions are lost on pod deletion. The `.xdg/` prefix keeps XDG state separate from OpenCode's project-level `.opencode/` directory.

### What happens during pod switch

When a project is suspended (idle timeout, pod eviction) and later accessed via proxy:

1. **Old pod is gone** — K8s deleted it, but the volume subPath `projects/{project-id}` still has all data
2. **New pod is created** — from warm pool or directly, with the same `subPath: "projects/{project-id}"`
3. **OpenCode reads persisted DB** — `opencode serve` starts, XDG env vars point to `/workspace/.xdg/share/opencode/opencode.db` on the volume, sessions are loaded
4. **DB updated** — new `podName`/`podIp` recorded; the `directory` field never changes
5. **Frontend restores session** — ProjectView queries `GET /api/proxy/{projectId}/session` for existing sessions, creates a MemoryRouter pre-navigated to `/{base64(directory)}/session/{sessionId}`, mounts OpenCode's AppInterface which renders the persisted chat history

The user sees the same chat history, same files, same context — on a completely different pod.

### What persists vs. what doesn't

| Persists across pod switches | Does NOT persist |
|------------------------------|-----------------|
| Chat history (in `opencode.db`) | In-memory process state (running commands) |
| File changes in `/workspace` | Active terminal sessions (PTY connections drop) |
| OpenCode session state & diffs | Network connections from the agent |
| Working directory contents | Temporary files outside `/workspace` (e.g. `/tmp`) |
| User config (XDG_CONFIG_HOME) | In-flight HTTP connections from the agent |
| OpenCode cache (XDG_CACHE_HOME) | |
| VS Code settings & extensions (code-server) | |

### Session restore flow (frontend)

```
1. User clicks project in sidebar → frontend renders ProjectView
2. ProjectView fetches GET /api/proxy/{projectId}/path → gets working directory
3. ProjectView fetches GET /api/proxy/{projectId}/session (OpenCode sessions API)
4. If sessions exist → picks most recent (sorted by updated time, excluding child sessions)
5. Creates MemoryRouter with initial path = /{base64(directory)}/session/{sessionId}
6. Mounts OpenCode's AppInterface with server URL pointing to /api/proxy/{projectId}
7. OpenCode SDK connects to agent pod, loads session from persisted SQLite DB
8. Chat history renders inline — same component tree, no iframe boundary
```

### Why delete+recreate instead of patching pods

K8s volume mounts (including `subPath`) are **immutable after pod creation**. A warm pod has no subPath (empty `/workspace`). To assign it to a project, we must delete the warm pod and create a new one with `subPath: "projects/{project-id}"`. This is not a limitation of our design — it's a K8s constraint.

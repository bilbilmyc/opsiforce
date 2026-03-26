# Opsiforce Architecture

Complete technical reference for the Opsiforce AI coding assistant platform.

---

## System Overview

Opsiforce embeds an AI coding assistant (powered by [OpenCode](https://github.com/sst/opencode)) into the Sima platform. Each user interaction ("project") gets its own isolated Kubernetes pod with persistent storage on CephFS.

```
Browser
  │
  ▼
opsiforce-proxy (nginx + OAuth2 Proxy)
  │
  ├── /             → opsiforce-frontend (Solid.js — projects sidebar + OpenCode UI embedded directly)
  └── /api/**       → opsiforce-backend (NestJS — pod orchestration + API proxy)
                         │
                         ├── K8s API (create/delete/watch agent pods)
                         ├── PostgreSQL (projects + pods state via Drizzle ORM)
                         ├── Redis (pod timeout TTL tracking)
                         └── Agent Pod (opencode serve :4096)
                                │
                                └── CephFS volume (subPath: projects/{project-id})
```

The frontend integrates OpenCode at the source level — OpenCode's Solid.js components (`AppBaseProviders`, `AppInterface`) are imported directly via a custom Vite resolver plugin and rendered inline (no iframe).

---

## Services

### Local dev (apps run locally, infra in minikube)

| Service | Where | Port | Notes |
|---------|-------|------|-------|
| **Backend** | Local (NestJS --watch) | 3001 | Hot reload. Connects to minikube PG/Redis/K8s. |
| **Frontend** | Local (Vite HMR) | 8084 | Hot reload. |
| **PostgreSQL** | Minikube (port-forwarded) | 5435 | Shared with other sima apps. |
| **Redis** | Minikube (port-forwarded) | 6382 | Shared with other sima apps. |
| **Agent pods** | Minikube | 4096 | Dynamically created by backend. hostPath storage. |

### Production (4 K8s deployments + agent pods)

| Service | Image | Port | What it does |
|---------|-------|------|-------------|
| **opsiforce-proxy** | `nginx:alpine` + oauth2-proxy sidecar | 80 | Routes traffic between services. OAuth2 Proxy for auth. |
| **opsiforce-frontend** | `nginx:alpine` (static) | 80 | Solid.js app — projects sidebar + OpenCode UI embedded via source-level imports (Vite resolver plugin). Single SPA, no iframe. |
| **opsiforce-backend** | `node:24-alpine` | 3001 | NestJS + Fastify. Manages K8s pods, proxies to agent pods, tracks timeouts. Pure API. |
| **opsiforce-agent** | `oven/bun:1.3-debian` | 4096 | OpenCode CLI via `opencode-ai` npm package (`opencode serve`). One pod per project. CephFS subPath mount. |

---

## Request Flow

### Starting a new project

```
1. User clicks "New Project" in sidebar
2. Frontend POST /api/projects → proxy → backend
3. Backend ProjectService:
   a. Creates project record in PostgreSQL (status: pending)
   b. Claims warm pod from pool (PodPoolService)
   c. Deletes warm pod, creates new pod with subPath = "projects/{project-id}"
   d. Waits for readiness probe (/global/health on :4096)
   e. Records pod IP in DB, sets project status to active
   f. Returns project ID to frontend
4. Frontend updates sidebar, navigates to ProjectView
5. ProjectView fetches /api/proxy/{projectId}/path for working directory
6. ProjectView fetches /api/proxy/{projectId}/session for existing sessions
7. Creates MemoryRouter with initial path /{base64(directory)}/session/{sessionId}
8. Mounts OpenCode's AppInterface connected to the agent pod via server URL
```

### Sending a chat message

```
1. User types in OpenCode UI (embedded in frontend)
2. OpenCode SDK → POST /api/proxy/{projectId}/session/{sid}/message
3. proxy → backend (NestJS)
4. ProxyMiddleware touches timeout (Redis SETEX pod:touch TTL 1800)
5. ProxyController resolves project → pod IP from DB
6. Backend proxies request to http://{podIp}:4096/session/{sid}/message
7. opencode serve processes message, streams SSE response back
8. Response streams through backend → proxy → frontend
```

### Pod timeout

```
Every 60 seconds (TimeoutCron.handleIdleTimeouts):
  1. List all active projects from DB
  2. For each: check Redis key "opsiforce:timeout:{projectId}" TTL
  3. If key expired (no activity in 30 min):
     a. Mark pod as terminating, delete K8s pod
     b. Clear pod from pods table and Redis key
     c. Update project status to "suspended", clear podName/podIp
  4. Replenish warm pool to configured size

Every 30 seconds (TimeoutCron.handleOrphanedProjects):
  1. List all active projects from DB
  2. For each: verify K8s pod still exists
  3. If pod gone (killed externally, OOM, node eviction):
     a. Clean up pods table and Redis key
     b. Update project status to "suspended"
```

### Resuming a suspended project

```
1. User clicks suspended project in sidebar
2. Frontend POST /api/projects/{id}/resume → proxy → backend
3. Backend ProjectService:
   a. Claims warm pod from pool (or creates directly if pool exhausted)
   b. Deletes warm pod, creates assigned pod with subPath = "projects/{project-id}"
   c. Waits for pod ready, records new podName/podIp
   d. opencode serve starts in existing directory (finds .opencode/ state)
   e. Session is restored — user continues where they left off
```

---

## Packages

```
packages/opsiforce/
├── backend/            Yarn workspace (NestJS + Fastify)
│   ├── src/
│   │   ├── main.ts              NestJS bootstrap (Fastify adapter, port 3001)
│   │   ├── app.module.ts        Root module
│   │   ├── config/              Environment configuration
│   │   ├── proxy/               Dynamic HTTP proxy (project → pod IP routing)
│   │   ├── pod/                 K8s pod CRUD + warm pool + pod spec builder
│   │   ├── project/             Project CRUD + resume/stop + history
│   │   └── timeout/             Redis TTL tracking + cron cleanup
│   └── db/
│       ├── schema.ts            Drizzle schema (projects + pods tables)
│       ├── index.ts             Database connection
│       └── migrations/          Drizzle Kit generated SQL
│
├── frontend/           Yarn workspace (Vite + Solid.js)
│   ├── opencode/               OpenCode source (imported at build time via Vite resolver plugin)
│   │   └── packages/           app/, ui/, util/, sdk/js/ — Solid.js components + SDK
│   └── src/                    Projects sidebar + OpenCode UI (direct source-level integration)
│       ├── app.tsx             Root: sidebar + project view routing
│       ├── pages/project.tsx   Mounts OpenCode's AppInterface inline (no iframe)
│       ├── components/         Project sidebar, create dialog
│       └── api/                TanStack Query client + query factories
│
├── agent-config/
│   └── AGENTS.md                Global rules baked into agent image at /workspace/AGENTS.md
│
├── docker/
│   ├── Dockerfile.agent         opencode CLI + git (bun-based)
│   ├── Dockerfile.backend       NestJS (multi-stage, Yarn PnP)
│   └── Dockerfile.frontend      Solid.js app (multi-stage → nginx)
│
└── helm/
    ├── opsiforce/               Infra: PVC, RBAC, ConfigMaps, agent pod template
    ├── opsiforce-proxy/         nginx + OAuth2 Proxy (routes between services)
    ├── opsiforce-frontend/      Solid.js deployment + service
    └── opsiforce-backend/       NestJS deployment + service + configmap + HPA
```

---

## Database Schema (Drizzle ORM + PostgreSQL)

### projects table

| Column | Type | Description |
|--------|------|-------------|
| id | text PK | UUID |
| title | text | User-provided name (nullable) |
| description | text | Optional context (nullable) |
| directory | text | CephFS subPath: "projects/{id}" |
| status | enum | pending, starting, active, suspended, stopped |
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

---

## Storage

### Production (CloudFleet cluster)
- **CephFS PVC** (`opsiforce-data`) — ReadWriteMany
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

The pod template sets these env vars to redirect state to the persistent volume:

```
XDG_DATA_HOME=/workspace/.xdg/share    → opencode.db, session diffs, logs
XDG_CONFIG_HOME=/workspace/.xdg/config → user config
```

Without these, sessions are lost on pod deletion. The `.xdg/` prefix keeps XDG state separate from OpenCode's project-level `.opencode/` directory.

### What happens during pod switch

When a project is suspended (idle timeout, pod eviction, user stop) and later resumed:

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
| User config (XDG_CONFIG_HOME) | OpenCode cache (`~/.cache/opencode/` — regenerated) |

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

---

## Warm Pod Pool (#1454)

The backend maintains X warm pods always running (configurable via `WARM_POOL_SIZE`).

```
Pod lifecycle:
  WARM → (assign to project) → delete warm pod → create assigned pod → ACTIVE
  ACTIVE → (30min idle) → TIMED_OUT → delete pod → project suspended → replenish warm pool
  ACTIVE → (user stops) → STOPPED → delete pod → replenish warm pool
  ACTIVE → (externally killed) → detected by orphan cron → project suspended → user resumes → new pod
```

Warm pods have no subPath mount (empty working directory). When assigned:
1. The warm pod is deleted
2. A new pod is created with the correct `subPath: "projects/{project-id}"`
3. K8s volumes are immutable after pod creation — this is why we delete+create, not patch

If the warm pool is exhausted, both `create` and `resume` fall back to creating a pod directly (no warm pod needed). Pod template overrides (resources, nodeSelector, tolerations, affinity) are configurable via env vars / Helm values.

---

## AGENTS.md Injection (#1461)

`agent-config/AGENTS.md` is baked into the agent Docker image at `/workspace/AGENTS.md` via Dockerfile COPY.

- OpenCode reads `AGENTS.md` from its working directory automatically (project-level rules)
- Update by editing `agent-config/AGENTS.md` and rebuilding the agent image
- Use sparingly — this consumes context window on every project

---

## API Endpoints (backend)

### Project Management

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects | Create new project (assigns pod) |
| GET | /api/projects | List all projects (history, newest first) |
| GET | /api/projects/:id | Get project details |
| PATCH | /api/projects/:id | Update project metadata (title, description) |
| POST | /api/projects/:id/resume | Resume suspended project (new pod, same data) |
| POST | /api/projects/:id/stop | Stop project (kill pod, preserve data) |
| DELETE | /api/projects/:id | Delete project (kill pod, delete data) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | K8s liveness/readiness probe |

### Proxy (forwarded to agent pod)

| Method | Path | Description |
|--------|------|-------------|
| ALL | /api/proxy/:projectId/* | HTTP proxy — resolves project → pod IP, forwards request. Streams SSE responses for chat. |

Every proxied request touches the Redis timeout key, keeping the pod alive while in use.

### Proxy routing modes

The backend resolves upstream URLs in two ways (ProxyService.resolveUpstream):

| Mode | When | URL pattern |
|------|------|-------------|
| **K8s API proxy** | `K8S_API_PROXY_URL` is set (local dev) | `http://localhost:8001/api/v1/namespaces/{ns}/pods/{pod}:{port}/proxy` |
| **Direct pod IP** | `K8S_API_PROXY_URL` is empty (production) | `http://{podIp}:{agentPort}` |

Local dev uses `kubectl proxy` (port 8001) because the backend runs outside minikube and can't reach pod IPs directly. In production, the backend runs inside the cluster and routes to pod IPs.

### Activity tracking detail

`ProxyMiddleware` intercepts every `/proxy/{projectId}/*` request and calls `ProjectService.touchActivity(projectId)` — updates both Redis TTL and `projects.lastActiveAt` in PostgreSQL.

---

## Pod Implementation Details

### Naming

Pod names follow the pattern `opsiforce-agent-{uuid[:8]}` — first 8 chars of the project UUID (or a fresh UUID for warm pods).

### Labels

| Label | Value | Purpose |
|-------|-------|---------|
| `app` | `opsiforce-agent` | Identifies all agent pods |
| `opsiforce.io/pool` | `warm` or `assigned` | Pool membership |
| `opsiforce.io/project-id` | `{project-id}` | Links pod to project (assigned only) |

### Readiness probe

```yaml
readinessProbe:
  httpGet:
    path: /global/health
    port: 4096
  initialDelaySeconds: 3
  periodSeconds: 5
```

Backend polls for readiness every 2s with a 60s timeout (`PodService.waitForReady`). The pod is considered ready when its `Ready` condition is `True` and it has a `podIP`.

### Restart policy

`restartPolicy: Always` — if opencode crashes inside the pod, K8s restarts the container automatically. The CephFS volume mount is preserved (pod is not recreated, only the container restarts).

---

## Environment Variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | - | PostgreSQL connection string |
| REDIS_URL | redis://localhost:6379 | Redis for timeout tracking |
| K8S_NAMESPACE | opsiforce | Namespace for agent pods |
| K8S_API_PROXY_URL | "" | K8s API proxy URL for routing (local: `http://localhost:8001` via `kubectl proxy`) |
| WARM_POOL_SIZE | 2 | Number of warm pods to maintain |
| AGENT_IMAGE | opsiforce-agent:1.2.27 | Docker image for agent pods (tag = opencode version) |
| AGENT_IMAGE_PULL_POLICY | IfNotPresent | K8s imagePullPolicy (Never for minikube, Always for prod) |
| AGENT_PORT | 4096 | Port opencode serve listens on |
| CEPHFS_PVC_NAME | opsiforce-cephfs | PVC name for shared storage |
| STORAGE_TYPE | cephfs | "cephfs" (prod) or "hostPath" (minikube) |
| STORAGE_HOST_PATH | /tmp/opsiforce-data | hostPath directory (minikube only) |
| TIMEOUT_IDLE_MINUTES | 30 | Minutes of inactivity before pod kill |
| PLATFORM_VERSION | 0.1.0 | Recorded per project (#1477) |
| AGENT_RESOURCES | (see below) | JSON — pod resource requests/limits |
| AGENT_NODE_SELECTOR | {} | JSON — K8s nodeSelector for agent pods |
| AGENT_TOLERATIONS | [] | JSON — K8s tolerations for agent pods |
| AGENT_AFFINITY | {} | JSON — K8s affinity rules for agent pods |

Default `AGENT_RESOURCES`:
```json
{"requests":{"cpu":"200m","memory":"512Mi"},"limits":{"memory":"2Gi"}}
```

---

## Running Opsiforce

### Quick start

```bash
# First time (installs minikube, PG, Redis, Keycloak, creates DB):
yarn dev-opsiforce

# Subsequent runs (minikube already set up):
yarn dev-opsiforce-only
```

Same pattern as `yarn dev-makara` / `yarn dev-makara-only`.

### What starts

After running `yarn dev-opsiforce-only`, you'll have:

| What | URL / Port | How to access |
|------|-----------|---------------|
| **Proxy (entry point)** | http://localhost:4110 | Open in browser — routes to all services |
| **Solid.js frontend (internal)** | http://localhost:8084 | Vite HMR, accessed through proxy at :4110 |
| **NestJS backend API (internal)** | http://localhost:3001 | Accessed through proxy at :4110/api |
| **Drizzle Studio** | http://localhost:4983 | DB browser (opens automatically) |
| **PostgreSQL** | localhost:5435 | Via port-forward (shared with makara/adam) |
| **Redis** | localhost:6382 | Via port-forward (shared) |
| **Agent pods** | In minikube (no external port) | Backend routes to them internally |

### How to access the full app

**For local dev, open http://localhost:4110** — this goes through the nginx proxy in minikube,
which routes to your local dev servers (same pattern as makara on :4111, keycloak-ms on :4112).

The frontend embeds OpenCode directly (source-level integration via Vite resolver plugin — no iframe).
API calls go to http://localhost:3001 (the backend) via Vite's dev proxy.

**In production**, everything is behind the nginx proxy at one URL:
- `/` → Solid.js frontend (with OpenCode embedded)
- `/api/*` → NestJS backend

Users access one URL and the proxy routes internally.

### What happens under the hood

```
yarn dev-opsiforce-only
  │
  ├── yarn port-forward-all (background)
  │     Exposes minikube PG:5435, Redis:6382, Keycloak:8086
  │
  ├── @opsiforce/backend minikube-dev:
  │     1. Creates /data/opsiforce on minikube node (one-time)
  │     2. Builds agent Docker image into minikube
  │     3. Deploys infra Helm chart (RBAC, hostPath storage, configmaps)
  │     4. Runs Drizzle migrations against PG
  │     5. Starts NestJS dev server on :3001 (hot reload)
  │     6. Starts Drizzle Studio on :4983
  │
  └── @opsiforce/frontend minikube-dev:
        1. Starts Vite dev server on :8084 (HMR)
        2. Vite resolver plugin maps @opencode-ai/* → frontend/opencode/packages/*/src/
```

### Testing the backend API directly

```bash
# List projects
curl http://localhost:3001/api/projects

# Create a project
curl -X POST http://localhost:3001/api/projects

# Get a specific project
curl http://localhost:3001/api/projects/{project-id}

# Resume a suspended project
curl -X POST http://localhost:3001/api/projects/{project-id}/resume

# Stop a project
curl -X POST http://localhost:3001/api/projects/{project-id}/stop

# Health check
curl http://localhost:3001/api/health
```

### Individual Commands

```bash
# Install deps
yarn install

# Type check
yarn workspace @opsiforce/backend run ts
yarn workspace @opsiforce/frontend run ts

# Database
yarn workspace @opsiforce/backend run db:generate     # Generate migration from schema changes
yarn workspace @opsiforce/backend run db:migrate      # Apply migrations
yarn workspace @opsiforce/backend run db:studio        # Visual DB browser
```

### Production Deployment

Handled by CI/CD — see [CI/CD & Deployment](#cicd--deployment) below.

---

## CI/CD & Deployment

### Overview

GitHub Actions workflow: `.github/workflows/opsiforce.yml`

All 3 Docker images are built in parallel, then deployed sequentially via 4 Helm charts to AWS EKS.

```
                        opsiforce.yml
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  backend-build       frontend-build        agent-build
  (docker-build.yml)  (docker-build.yml)   (docker-build.yml)
         │                   │                   │
         └───────────────────┼───────────────────┘
                             ▼
                      opsiforce-deploy
                             │
              ┌──────────────┼──────────────┐──────────────┐
              ▼              ▼              ▼              ▼
        helm upgrade   helm upgrade   helm upgrade   helm upgrade
        opsiforce      opsiforce-     opsiforce-     opsiforce-
        (infra)        backend        frontend       proxy
```

### Triggers

| Event | Condition | Builds | Pushes to ECR | Deploys |
|-------|-----------|--------|---------------|---------|
| Push to `main` | Path matches `packages/opsiforce/**` or workflow files | Yes | Yes | Yes → `opsiforce-development` |
| Push to `production-opsiforce` | Same path filter | Yes | Yes | Yes → `opsiforce-production` |
| Pull request to `main` or `production-opsiforce` | Same path filter | Yes | No | No |
| `workflow_dispatch` | Manual | Yes | Yes | Yes (branch-dependent) |

Concurrency: pushes cancel previous in-flight runs on the same branch. PRs get per-PR concurrency groups (no cross-PR cancellation).

### Docker Images

All images are stored in a single AWS ECR repository: `471112501003.dkr.ecr.us-east-1.amazonaws.com/opsiforce`.

Images are distinguished by tag prefix:

| Image | Dockerfile | Base | What it produces |
|-------|-----------|------|-----------------|
| **backend** | `docker/Dockerfile.backend` | `node:24-alpine` (multi-stage) | Yarn PnP production build of NestJS. CMD: `yarn run start` |
| **frontend** | `docker/Dockerfile.frontend` | `node:24-alpine` → `nginx:alpine` (multi-stage) | Static Solid.js build served by nginx. Includes OpenCode source (at `frontend/opencode/`) resolved at build time by Vite plugin. |
| **agent** | `docker/Dockerfile.agent` | `oven/bun:1.3-debian` | Installs `opencode-ai@1.3.2` globally + git + openssh. Copies `agent-config/AGENTS.md` to `/workspace/`. CMD: `opencode serve --port 4096` |

### Image Tagging

Tags follow the pattern: `{component}-{environment}-{sha7}` (versioned) + `{component}-{environment}` (stable pointer).

| Event | Versioned tag | Stable tag | Pushed? |
|-------|--------------|------------|---------|
| Push to `main` | `backend-development-abc1234` | `backend-development` | Yes |
| Push to `production-opsiforce` | `backend-production-abc1234` | `backend-production` | Yes |
| Pull request | `backend-pr-123-abc1234` | `backend-pr-123` | No (build only) |

Same pattern for `frontend-*` and `agent-*`.

Tag generation is handled by `.github/workflows/docker-tags.py` — a Python script that computes the final comma-separated tag list from inputs.

### Reusable Workflows

| Workflow | Purpose | Used by |
|----------|---------|---------|
| `docker-build.yml` | Build & push Docker image to ECR. Uses Buildx (`linux/amd64`), OIDC auth to AWS. | 3 build jobs |
| `helm-deploy.yml` | Generic `helm upgrade --install` to EKS. Not currently used by opsiforce (deploy is inline). | Available but unused |

### Deploy Phase

Runs only on push (not PRs). Waits for all 3 builds to succeed.

**Steps:**

1. Authenticate to AWS via OIDC (`arn:aws:iam::471112501003:role/github_actions`)
2. `aws eks update-kubeconfig --name sima --region us-east-1`
3. Determine environment from branch:

| Branch | Namespace | ENV_SUFFIX |
|--------|-----------|------------|
| `main` | `opsiforce-development` | `development` |
| `production-opsiforce` | `opsiforce-production` | `production` |

4. Deploy 4 Helm charts sequentially (each with `--wait`):

```bash
# 1. Infra (RBAC, PVC, ConfigMaps, agent pod template)
helm upgrade --install opsiforce-infra-{env} ./helm/opsiforce \
  --set agent.image.tag=agent-{env}-{sha7}

# 2. Backend (NestJS deployment + service + config)
helm upgrade --install opsiforce-backend-{env} ./helm/opsiforce-backend \
  --set backend.image.tag=backend-{env}-{sha7} \
  --set serviceAccountName=opsiforce-opsiforce-infra-{env}-agent \
  --set config.agentImage=...opsiforce:agent-{env}-{sha7} \
  --set config.cephfsPvcName=opsiforce-opsiforce-infra-{env}-cephfs \
  --set config.platformVersion={sha7}

# 3. Frontend (nginx serving static Solid.js build)
helm upgrade --install opsiforce-frontend-{env} ./helm/opsiforce-frontend \
  --set frontend.image.tag=frontend-{env}-{sha7}

# 4. Proxy (nginx router + optional OAuth2 Proxy)
helm upgrade --install opsiforce-proxy-{env} ./helm/opsiforce-proxy \
  --set proxy.backendService=http://opsiforce-backend-opsiforce-backend-{env}:3001 \
  --set proxy.frontendService=http://opsiforce-frontend-opsiforce-frontend-{env}:80
```

Deploy order matters: infra creates the ServiceAccount and PVC that backend needs; backend must be up before proxy routes to it.

### Helm Charts

4 charts in `helm/`:

#### 1. `opsiforce` (infra)

Shared infrastructure that other charts depend on.

| Template | What it creates |
|----------|----------------|
| `rbac.yaml` | ServiceAccount + Role + RoleBinding — grants backend permission to CRUD pods, read logs, exec into pods |
| `pvc-cephfs.yaml` | CephFS PVC (`ReadWriteMany`) — only created when `storage.type == "pvc"` (production) |
| `agent-pod-template.yaml` | JSON pod spec template — backend reads this to create agent pods with correct image, resources, volumes |

#### 2. `opsiforce-backend`

| Template | What it creates |
|----------|----------------|
| `deployment.yaml` | NestJS container (port 3001). Uses serviceAccount from infra chart. Health: `/api/health`. preStop: 30s sleep for graceful drain. |
| `service.yaml` | ClusterIP:80 → 3001 |
| `configmap.yaml` | All backend env vars (DATABASE_URL, REDIS_URL, K8S_NAMESPACE, AGENT_IMAGE, etc.) injected via `envFrom` |
| `hpa.yaml` | HorizontalPodAutoscaler (disabled by default, CPU-based) |

#### 3. `opsiforce-frontend`

| Template | What it creates |
|----------|----------------|
| `deployment.yaml` | nginx:alpine serving static Solid.js build. Health: `/`. preStop: 30s sleep. |
| `service.yaml` | ClusterIP:80 |

#### 4. `opsiforce-proxy`

| Template | What it creates |
|----------|----------------|
| `deployment.yaml` | nginx container + optional OAuth2 Proxy sidecar (Keycloak OIDC). preStop: 30s sleep. |
| `service.yaml` | ClusterIP:80 |
| `configmap.yaml` | nginx.conf — routes: `/api` (HTTP to backend, buffering off for SSE), `/` (to frontend) |

OAuth2 Proxy sidecar (when `oauth2Proxy.enabled`):
- Provider: `keycloak-oidc`
- Session store: Redis
- Listens on `:4180`, upstreams to nginx on `:80`
- Passes access token, skips JWT bearer tokens, CSRF per-request

### Cross-Chart Dependencies

```
opsiforce-proxy
  ├── needs service name of → opsiforce-backend  (proxy.backendService)
  └── needs service name of → opsiforce-frontend (proxy.frontendService)

opsiforce-backend
  ├── needs ServiceAccount from → opsiforce (infra)  (serviceAccountName)
  ├── needs PVC name from       → opsiforce (infra)  (config.cephfsPvcName)
  └── needs agent image tag from → opsiforce (infra) (config.agentImage)
```

These are wired together via `--set` flags in the deploy step. Helm release names follow the pattern `opsiforce-{chart}-{env}`, and K8s service names are derived from the Helm fullname template.

### Rollout Strategy

All deployments use `rollme: {{ randAlphaNum 5 }}` annotation — this forces a new rollout on every `helm upgrade`, even if the image tag hasn't changed (useful when ConfigMaps change). Combined with `--wait`, each `helm upgrade` blocks until the new pods are Ready.

All containers have a `preStop: sleep 30` hook — this keeps the old pod alive for 30s after receiving SIGTERM, allowing in-flight requests to drain before the pod shuts down.

---

## Tickets Implemented

| Ticket | Title | Where |
|--------|-------|-------|
| #1451 | CephFS PVC | `helm/opsiforce/templates/pvc-cephfs.yaml` |
| #1454 | K8s pod-per-project with warm pool | `backend/src/pod/`, `helm/opsiforce/templates/rbac.yaml` |
| #1450 | Helm chart | `helm/` (4 charts) |
| #1449 | Projects history | `backend/src/project/`, `frontend/src/App.tsx` |
| #1477 | Platform version per project | `backend/db/schema.ts` (platformVersion) |
| #1461 | AGENTS.md injection | `agent-config/AGENTS.md`, `docker/Dockerfile.agent` |

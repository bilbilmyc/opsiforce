# API Reference

Backend endpoints, proxy behavior, and runtime configuration.

---

## API endpoints

### Projects

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects` | Create project, persist it as `starting`, queue pod startup |
| GET | `/api/projects` | List projects for the current tenant |
| GET | `/api/projects/:id` | Get project details |
| PATCH | `/api/projects/:id` | Update title, description, or timeout settings |
| DELETE | `/api/projects/:id` | Delete project, pod, timeout keys, and project data references |

Project status values returned by the API:

- `starting` -> startup or recovery is in progress
- `active` -> assigned pod exists and is routable
- `suspended` -> no active pod

### Uploads

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/projects/:projectId/upload` | Upload file(s) into the persistent project directory and touch the agent TTL |

### Usage

Available only when Bifrost is configured.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/usage` | Aggregate usage for the current tenant |
| GET | `/api/usage/projects/:id` | Usage for one project |
| GET | `/api/usage/projects/:id/budgets` | Budget config for project keys |
| PUT | `/api/usage/projects/:id/budgets` | Update budget for one key type |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Backend liveness/readiness |

### Agent proxy

| Method | Path | Description |
|--------|------|-------------|
| ALL | `/api/proxy/:projectId/*` | Go proxy to the OpenCode agent on port 4096 |

App preview, public app access, VS Code, and DB viewer are handled by dedicated Go runtime proxy deployments:

- in-product app preview -> `{projectId}.{WEBAPP_PREVIEW_DOMAIN}` -> runtime-app-proxy:3002 -> pod:3000
- public app access -> `{projectId}.{WEBAPP_DOMAIN}` -> runtime-app-proxy:3002 -> pod:3000
- VS Code -> `{projectId}.{VSCODE_DOMAIN}` -> runtime-vscode-proxy:3003 -> pod:8080
- DB viewer -> `{projectId}.{DB_DOMAIN}` -> runtime-db-proxy:3004 -> pod:8081

---

## Restart semantics

All four proxy entrypoints run the same backend-managed ensure flow before proxying.

If the project is `starting`, suspended, or missing its pod:

1. backend requests or continues startup
2. backend returns HTTP `503`
3. response body is `{"error":"Pod is restarting, please retry"}`

If a live proxy request detects a Kubernetes pod failure, or a follow-up ensure check confirms that the pod disappeared, backend transitions the project back into `starting` and returns the same temporary `503` response.

If the upstream process fails while the pod still exists, backend returns HTTP `502` and leaves the project pod running.

---

## Activity tracking

Opsiforce tracks two TTLs per project in Redis or Valkey:

- agent TTL -> touched by `/api/proxy/*` and upload traffic
- app TTL -> touched by app preview and VS Code traffic

The project is suspended only when both TTLs expire.

---

## Proxy routing

The backend routes traffic to agent pods via direct pod IPs (`http://{podIp}:{port}`). Both local dev (backend in-cluster via Tilt) and prod (backend in-cluster via Helm) share the same pod-network reachability, so no API-server pod-proxy hop is needed.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis or Valkey for timeout tracking |
| `K8S_NAMESPACE` | `opsiforce` (prod) / `local` (dev) | Namespace for agent pods |
| `WARM_POOL_SIZE` | `2` | Number of warm pods to keep available |
| `AGENT_CONTAINER_IMAGE` | derived | Agent container image used for assigned and warm pods |
| `AGENT_CONTAINER_IMAGE_PULL_POLICY` | `IfNotPresent` | Pod image pull policy |
| `AGENT_PORT` | `4096` | OpenCode agent port |
| `APP_PORT` | `3000` | App preview port |
| `VSCODE_PORT` | `8080` | VS Code port |
| `DB_VIEWER_PORT` | `8081` | Datasette DB viewer port |
| `PROXY_CONTROL_TOKEN` | local default | Shared secret between backend and Go runtime proxies |
| `AGENT_NAME` | `app-builder` | Agent profile loaded into the workspace |
| `CEPHFS_PVC_NAME` | `opsiforce-cephfs` | CephFS PVC name |
| `STORAGE_TYPE` | `cephfs` | `cephfs` or `hostPath` |
| `STORAGE_MOUNT_PATH` | `/workspace-data` | Where the shared volume is mounted: in-pod path for the backend, and (for hostPath mode) also the host filesystem path on the K8s node |
| `PLATFORM_VERSION` | file-derived | Recorded per project at creation |
| `AGENT_RESOURCES` | see values | JSON pod resources |
| `AGENT_NODE_SELECTOR` | `{}` | JSON nodeSelector |
| `AGENT_TOLERATIONS` | `[]` | JSON tolerations |
| `AGENT_AFFINITY` | `{}` | JSON affinity |
| `IMAGE_PULL_SECRETS` | `[]` | JSON imagePullSecrets |
| `OPENAI_API_KEY` | `""` | Shared OpenAI key when Bifrost is disabled |
| `BIFROST_PROXY_URL` | `""` | Bifrost admin/proxy URL |
| `BIFROST_POD_PROXY_URL` | same as `BIFROST_PROXY_URL` | Bifrost URL visible from the agent pod |
| `BIFROST_ADMIN_USERNAME` | `""` | Bifrost admin username |
| `BIFROST_ADMIN_PASSWORD` | `""` | Bifrost admin password |

`notify-keyspace-events Ex` must be enabled in the Redis or Valkey deployment itself.

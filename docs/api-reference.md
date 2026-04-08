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
| ALL | `/api/proxy/:projectId/*` | HTTP proxy to the OpenCode agent on port 4096 |

App preview and VS Code stay on subdomain proxies in this phase:

- app preview -> `{projectId}.{WEBAPP_DOMAIN}` -> backend:3002 -> pod:3000
- VS Code -> `{projectId}.{VSCODE_DOMAIN}` -> backend:3003 -> pod:8080

---

## Restart semantics

All three proxy entrypoints run the same project-pod ensure flow before proxying.

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

## Proxy routing modes

The backend resolves pod upstreams in two ways:

| Mode | When | URL pattern |
|------|------|-------------|
| Kubernetes API proxy | `K8S_API_PROXY_URL` is set | `{K8S_API_PROXY_URL}/api/v1/namespaces/{ns}/pods/{pod}:{port}/proxy` |
| Direct pod IP | `K8S_API_PROXY_URL` is empty | `http://{podIp}:{port}` |

Local development normally uses `kubectl proxy`. In-cluster deployments normally route directly to pod IPs.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis or Valkey for timeout tracking |
| `K8S_NAMESPACE` | `opsiforce` | Namespace for agent pods |
| `K8S_API_PROXY_URL` | `""` | Kubernetes API proxy base URL for local dev |
| `WARM_POOL_SIZE` | `2` | Number of warm pods to keep available |
| `AGENT_IMAGE` | derived | Agent image used for assigned and warm pods |
| `AGENT_IMAGE_PULL_POLICY` | `IfNotPresent` | Pod image pull policy |
| `AGENT_PORT` | `4096` | OpenCode agent port |
| `APP_PORT` | `3000` | App preview port |
| `VSCODE_PORT` | `8080` | VS Code port |
| `VSCODE_PROXY_PORT` | `3003` | Backend VS Code proxy port |
| `AGENT_NAME` | `app-builder` | Agent profile loaded into the workspace |
| `CEPHFS_PVC_NAME` | `opsiforce-cephfs` | CephFS PVC name |
| `STORAGE_TYPE` | `cephfs` | `cephfs` or `hostPath` |
| `STORAGE_HOST_PATH` | `/tmp/opsiforce-data` | Local hostPath root |
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

# API Reference

Backend API endpoints, proxy routing modes, and environment variables.

---

## API Endpoints (backend)

### Project Management

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/projects | Create new project (assigns pod) |
| GET | /api/projects | List all projects (history, newest first) |
| GET | /api/projects/:id | Get project details |
| PATCH | /api/projects/:id | Update project metadata (title, description) |
| DELETE | /api/projects/:id | Delete project (kill pod, delete data) |

### Usage (requires Bifrost)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/usage | Aggregate token/cost usage for current tenant (all projects) |
| GET | /api/usage/projects/:id | Token/cost usage for a specific project |
| GET | /api/usage/projects/:id/budgets | Get budget config for a project's keys |
| PUT | /api/usage/projects/:id/budgets | Update budget for a key type |

Usage returns `{ totalRequests, totalTokens, totalCost, averageLatency, successRate, byKeyType? }`. The `byKeyType` array breaks down usage by key type (`chat` vs `backend`). Returns zeros when Bifrost is not configured.

Budget PUT body: `{ keyType: "chat"|"backend", maxBudget: number, budgetDuration: "1M"|"1d"|... }`. Set `maxBudget` to `0` to remove the limit. See [LLM Gateway](llm-gateway.md) for details.

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | K8s liveness/readiness probe |

### Proxy (forwarded to agent pod)

| Method | Path | Description |
|--------|------|-------------|
| ALL | /api/proxy/:projectId/* | HTTP proxy to OpenCode server (port 4096). Streams SSE responses for chat. |

Webapp and VS Code use **subdomain-based proxy servers** (not path-based):
- Webapp: `{projectId}.{WEBAPP_DOMAIN}` → backend:3002 → pod:3000
- VS Code: `{projectId}.{VSCODE_DOMAIN}` → backend:3003 → pod:8080

**Timeout behavior:** Agent proxy (`/api/proxy`) resets the agent timeout key (default 30 min). Webapp proxy (`/api/webapp`) resets the app timeout key (default 7 days). Pod suspended only when both keys expire. If the pod is dead or the project is suspended, the proxy triggers automatic reassignment and returns 503.

---

## Proxy routing modes

The backend resolves upstream URLs in two ways (ProxyService.resolveUpstream):

| Mode | When | URL pattern |
|------|------|-------------|
| **K8s API proxy** | `K8S_API_PROXY_URL` is set (local dev) | `http://localhost:8001/api/v1/namespaces/{ns}/pods/{pod}:{port}/proxy` |
| **Direct pod IP** | `K8S_API_PROXY_URL` is empty (production) | `http://{podIp}:{agentPort}` |

Local dev uses `kubectl proxy` (port 8001) because the backend runs outside minikube and can't reach pod IPs directly. In production, the backend runs inside the cluster and routes to pod IPs.

### Activity tracking detail

`ProxyController` calls `ProjectService.touchActivity(projectId)` (agent key, 30 min TTL). `WebappProxyController` calls `ProjectService.touchAppActivity(projectId)` (app key, 7 day TTL). Both update `projects.lastActiveAt` in PostgreSQL. Pod suspended only when both Redis keys expire.

---

## Environment Variables (backend)

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | - | PostgreSQL connection string |
| REDIS_URL | redis://localhost:6379 | Redis for timeout tracking |
| K8S_NAMESPACE | opsiforce | Namespace for agent pods |
| K8S_API_PROXY_URL | "" | K8s API proxy URL for routing (local: `http://localhost:8001` via `kubectl proxy`) |
| WARM_POOL_SIZE | 2 | Number of warm pods to maintain |
| AGENT_IMAGE | (derived) | Docker image for agent pods. Defaults to `opsiforce-agent:${agentImageVersion}` (from `agent-config/agent-image-version.json`). Prod overrides via Helm. |
| AGENT_IMAGE_PULL_POLICY | IfNotPresent | K8s imagePullPolicy (Never for minikube, Always for prod) |
| AGENT_PORT | 4096 | Port opencode serve listens on |
| APP_PORT | 3000 | Port for app preview proxy (single app port in pod) |
| VSCODE_PORT | 8080 | Port for code-server (VS Code IDE) in agent pod |
| VSCODE_PROXY_PORT | 3003 | Port for VS Code subdomain proxy server |
| AGENT_NAME | app-builder | Which agent profile to load (matches folder in `agent-config/agents/`) |
| CEPHFS_PVC_NAME | opsiforce-cephfs | PVC name for shared storage |
| STORAGE_TYPE | cephfs | "cephfs" (prod) or "hostPath" (minikube) |
| STORAGE_HOST_PATH | /tmp/opsiforce-data | hostPath directory (minikube only) |
| TIMEOUT_IDLE_MINUTES | 30 | Agent chat idle timeout (minutes) |
| APP_TIMEOUT_IDLE_MINUTES | 10080 | App preview idle timeout (7 days) |
| PLATFORM_VERSION | (from `backend/platform-version.json`) | Version recorded per project. Read directly from file, no env var needed. |
| AGENT_RESOURCES | (see below) | JSON — pod resource requests/limits |
| AGENT_NODE_SELECTOR | {} | JSON — K8s nodeSelector for agent pods |
| AGENT_TOLERATIONS | [] | JSON — K8s tolerations for agent pods |
| AGENT_AFFINITY | {} | JSON — K8s affinity rules for agent pods |
| IMAGE_PULL_SECRETS | [] | JSON — K8s imagePullSecrets for agent pods |
| OPENAI_API_KEY | "" | OpenAI API key — injected into agent pods as env var (never baked into image) |
| BIFROST_PROXY_URL | "" | Bifrost Admin API URL (backend → Bifrost). Set to enable LLM gateway. |
| BIFROST_POD_PROXY_URL | (= BIFROST_PROXY_URL) | Bifrost URL for agent pods (pod → Bifrost). Only needed in local dev. |
| BIFROST_ADMIN_USERNAME | "" | Bifrost Admin API basic-auth username |
| BIFROST_ADMIN_PASSWORD | "" | Bifrost Admin API basic-auth password |

Default `AGENT_RESOURCES`:
```json
{"requests":{"cpu":"200m","memory":"512Mi"},"limits":{"memory":"2Gi"}}
```

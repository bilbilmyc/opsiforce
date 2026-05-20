# Deployment & Local Dev

Running Opsiforce locally, CI/CD pipeline, Helm charts, and rollout strategy.

---

## Running Opsiforce

### Quick start

```bash
# First time from repo root:
yarn install
yarn run install-all

# Daily dev: run in separate terminals from repo root:
yarn run tunnel-traefik
yarn run port-forward-all
yarn run dev-opsiforce-only
```

See [`../README.md`](../README.md) for the full local prerequisites and command flow.

### What starts

After running the local dev commands, you'll have:

| What | URL / Port | How to access |
|------|-----------|---------------|
| **App (entry point)** | https://opsiforce.localtest.me | Open in browser — Traefik routes to in-cluster services |
| **Solid.js frontend** | http://localhost:8084 | Vite HMR on host; reached through Traefik |
| **NestJS backend** | In `local` namespace via Tilt | Tilt port-forwards `localhost:3010` for direct calls; debug on `:9229` |
| **Go runtime proxies** | In `local` namespace via Tilt, services `proxy-{agent,app,vscode,db}` (4 deployments, one per mode) | Reached cluster-internally; Traefik routes agent/app/vscode/db through them |
| **Drizzle Studio** | http://localhost:4983 | DB browser (opens automatically via `db:studio`) |
| **PostgreSQL** | localhost:5435 | Via port-forward (shared with makara/adam) |
| **Redis** | localhost:6382 | Via port-forward (shared) |
| **Agent pods** | In `local` namespace | Backend routes to pod IPs directly |

### How to access the full app

**For local dev, open https://opsiforce.localtest.me** — Traefik routes through the in-cluster
opsiforce-proxy (oauth2-proxy + nginx), which fans out to backend, frontend (host Vite via the
Traefik IngressRoute), and the runtime proxies.

The frontend embeds OpenCode directly (source-level integration via Vite resolver plugin — no iframe).
API calls go to the in-cluster backend service via Traefik routing.

**In production**, everything is behind the nginx proxy at one URL:
- `/` → Solid.js frontend (with OpenCode embedded)
- `/api/*` → NestJS backend

Users access one URL and the proxy routes internally.

### What happens under the hood

```
yarn run dev-opsiforce-only
  │
  ├── @opsiforce/backend minikube-dev:
  │     1. Creates /workspace-data inside minikube (via minikube ssh)
  │     2. Builds agent Docker image into minikube
  │     3. Deploys infra Helm chart (RBAC, hostPath storage, configmaps)
  │     4. Creates opsiforce and bifrost databases if missing
  │     5. Runs Drizzle migrations against PG
  │     6. Installs Bifrost
  │     7. Starts Drizzle Studio, Mailgun mock, and Tilt
  │
  ├── tilt up (in packages/opsiforce/backend):
  │     Builds backend and runtime proxy dev images, deploys them via Helm,
  │     syncs source edits into pods, and port-forwards 3010 (→pod 3001) + 9229.
  │
  └── @opsiforce/frontend minikube-dev:
        1. Starts Vite dev server on :8084 (HMR)
        2. Vite resolver plugin maps @opencode-ai/* → frontend/opencode/packages/*/src/
```

### Testing the backend API directly

```bash
# List projects
curl http://localhost:3010/api/projects

# Create a project
curl -X POST http://localhost:3010/api/projects

# Get a specific project
curl http://localhost:3010/api/projects/{project-id}

# Delete a project (kills pod, removes from DB)
curl -X DELETE http://localhost:3010/api/projects/{project-id}

# Health check
curl http://localhost:3010/api/health
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

All 4 Docker images are built in parallel (inline jobs, not reusable workflows), then deployed sequentially via 6 Helm charts to CloudFleet.

```
                        opsiforce.yml
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼                    ▼
  backend-build       frontend-build        agent-build      runtime-proxies-build
  (inline job)        (inline job)          (inline job)          (inline job)
         │                   │                   │                    │
         └───────────────────┼───────────────────┼────────────────────┘
                             ▼
                      opsiforce-deploy
                             │
         ┌──────────┬────────┬────────┬──────────────┬──────────┐
         ▼          ▼        ▼        ▼              ▼          ▼
    opsiforce   opsiforce- opsiforce- opsiforce- runtime-  opsiforce-
    (infra)     bifrost    backend    frontend   proxies    proxy
```

### Triggers

| Event | Condition | Builds | Pushes to GHCR | Deploys |
|-------|-----------|--------|----------------|---------|
| Push to `main` | Path matches `packages/opsiforce/**` or workflow files | Yes | Yes | Yes → `opsiforce-development` |
| Push to `production-opsiforce` | Same path filter | Yes | Yes | Yes → `opsiforce-production` |
| Pull request to `main` or `production-opsiforce` | Same path filter | Yes | No | No |
| `workflow_dispatch` | Manual | Yes | Yes | Yes (branch-dependent) |

Concurrency: pushes cancel previous in-flight runs on the same branch. PRs get per-PR concurrency groups (no cross-PR cancellation).

### Docker Images

All images are stored in a single GHCR repository: `ghcr.io/simadevelopment/opsiforce`.

Images are distinguished by tag prefix:

| Image | Dockerfile | Base | What it produces |
|-------|-----------|------|-----------------|
| **backend** | `docker/Dockerfile.backend` | `node:24-alpine` (multi-stage) | Yarn PnP production build of NestJS. CMD: `yarn run start` |
| **frontend** | `docker/Dockerfile.frontend` | `node:24-alpine` → `nginx:alpine` (multi-stage) | Static Solid.js build served by nginx. Includes OpenCode source (at `frontend/opencode/`) resolved at build time by Vite plugin. |
| **agent** | `docker/Dockerfile.agent` | `node:24-slim` + bun | Installs opencode-ai, agent-browser, chromium. Stages agent profiles to `/opt/agents/`, shared config to `/opt/opencode/`. Entrypoint runs opencode serve + app dev server via guard scripts. |
| **runtime-proxies** | `docker/Dockerfile.runtime-proxy` | `golang:1.26.2` → `alpine` | Single Go binary that runs in one of four modes: agent, app, vscode, db. |

### Image Tagging

**Backend/Frontend** tags: `{component}-{environment}-{sha7}` (versioned) + `{component}-{environment}` (stable pointer).

| Event | Versioned tag | Stable tag | Pushed? |
|-------|--------------|------------|---------|
| Push to `main` | `backend-development-abc1234` | `backend-development` | Yes |
| Push to `production-opsiforce` | `backend-production-abc1234` | `backend-production` | Yes |
| Pull request | `backend-pr-123-abc1234` | `backend-pr-123` | No (build only) |

Same pattern for `frontend-*`.

**Agent** tags follow the same `agent-{environment}-{sha}` + `agent-{environment}` pattern as backend/frontend.

| Event | Tag (SHA) | Tag (latest) | Pushed? |
|-------|-----------|--------------|---------|
| Push to `main` | `agent-development-abc1234` | `agent-development` | Yes |
| Push to `production-opsiforce` | `agent-production-abc1234` | `agent-production` | Yes |
| Pull request | `agent-pr-123-abc1234` | `agent-pr-123` | No (build only) |

Tag generation is handled inline in each build job using shell variable expansion.

### Deploy Phase

Runs only on push (not PRs). Waits for all 3 builds to succeed.

**Steps:**

1. Install CloudFleet CLI, Helm, and kubectl
2. Authenticate to CloudFleet cluster via `cloudfleet clusters kubeconfig {cluster-id}`
3. Create GHCR image pull secret in target namespace
4. Create opsiforce and bifrost databases on CNPG (CloudNativePG) if they don't exist
5. Sync Bifrost secrets into the target namespace
6. Determine environment from branch:

| Branch | Namespace | ENV_SUFFIX | Hostname |
|--------|-----------|------------|----------|
| `main` | `opsiforce-development` | `development` | `opsiforce.dev.opsima.com` |
| `production-opsiforce` | `opsiforce-production` | `production` | `opsiforce.opsima.com` |

7. Deploy 4 repo charts plus the upstream Bifrost chart sequentially (each with `--wait`):

```bash
# 1. Infra (RBAC, PVC)
helm upgrade --install opsiforce-infra-{env} ./helm/opsiforce \
  --set agent.image.repository=ghcr.io/simadevelopment/opsiforce \
  --set agent.image.tag=agent-{env}-{sha7}

# 2. Bifrost AI Gateway (upstream chart + repo values)
helm repo add bifrost https://maximhq.github.io/bifrost/helm-charts
helm repo update bifrost
helm upgrade --install opsiforce-bifrost-{env} bifrost/bifrost \
  --namespace {namespace} \
  --version 2.0.15 \
  -f ./helm/bifrost/values.prod.yaml
kubectl apply -n {namespace} -f ./helm/bifrost/networkpolicy.yaml

# 3. Backend (NestJS deployment + service + config)
helm upgrade --install opsiforce-backend-{env} ./helm/opsiforce-backend \
  --set backend.image.repository=ghcr.io/simadevelopment/opsiforce \
  --set backend.image.tag=backend-{env}-{sha7} \
  --set config.databaseUrl="{DATABASE_URL}" \
  --set serviceAccountName=opsiforce-opsiforce-infra-{env}-agent \
  --set config.k8sNamespace={namespace} \
  --set config.agentContainerImage=ghcr.io/simadevelopment/opsiforce:agent-{env}-{sha7} \
  --set config.cephfsPvcName=opsiforce-cephfs \
  --set config.platformVersion={sha7} \
  --set config.bifrostProxyUrl=http://opsiforce-bifrost:8080/v1 \
  --set config.bifrostAdminUsername=opsiforce-admin \
  --set config.bifrostAdminPassword={BIFROST_ADMIN_PASSWORD}

# 4. Frontend (nginx serving static Solid.js build)
helm upgrade --install opsiforce-frontend-{env} ./helm/opsiforce-frontend \
  --set frontend.image.repository=ghcr.io/simadevelopment/opsiforce \
  --set frontend.image.tag=frontend-{env}-{sha7}

# 5. Runtime proxies (four Go deployments from one image)
helm upgrade --install opsiforce-runtime-proxies-{env} ./helm/opsiforce-runtime-proxies \
  --set image.repository=ghcr.io/simadevelopment/opsiforce \
  --set image.tag=runtime-proxies-{env}-{sha7} \
  --set config.backendUrl=http://opsiforce-backend-opsiforce-backend-{env}:3001 \
  --set config.proxyControlToken={PROXY_CONTROL_TOKEN}

# 6. Proxy (nginx + OAuth2 Proxy + Traefik IngressRoute)
helm upgrade --install opsiforce-proxy-{env} ./helm/opsiforce-proxy \
  --set proxy.agentService=http://opsiforce-runtime-proxies-{env}-agent:3005 \
  --set proxy.backendService=http://opsiforce-backend-opsiforce-backend-{env}:3001 \
  --set proxy.frontendService=http://opsiforce-frontend-opsiforce-frontend-{env}:80 \
  --set ingressRoute.hostname={hostname} \
  --set ingressRoute.traefikTarget={traefik-dns} \
  --set oauth2Proxy.redisPath=redis://opsiforce-proxy-{env}-valkey:6379
```

Deploy order matters: infra creates the ServiceAccount and PVC; Bifrost must be up before backend (backend calls Bifrost Admin API); backend must be up before runtime proxies because they call the backend control API; runtime proxies and frontend must be up before the nginx proxy routes to them.

**Required GitHub Secrets:** `OPENAI_API_KEY`, `BIFROST_ADMIN_PASSWORD`, `BIFROST_ENCRYPTION_KEY`

### Helm Charts

Repo-owned deploy inputs:

#### 1. `opsiforce` (infra)

Shared infrastructure that other charts depend on.

| Template | What it creates |
|----------|----------------|
| `rbac.yaml` | ServiceAccount + Role + RoleBinding — grants backend permission to CRUD pods, read logs, exec into pods |
| `pvc-cephfs.yaml` | CephFS PVC (`ReadWriteMany`) — only created when `storage.type == "pvc"` (production) |

#### 2. `helm/bifrost/`

Bifrost AI Gateway — LLM proxy with per-project virtual keys, usage tracking, and budget enforcement. See [LLM Gateway](llm-gateway.md).

| File | What it controls |
|----------|----------------|
| `helm/bifrost/values.prod.yaml` | Upstream Bifrost image pin (`v1.4.20`) and cluster values: external CNPG, auth, OpenAI provider, fixed single-replica deployment, service name |
| `helm/bifrost/values.local.yaml` | Upstream Bifrost image pin (`v1.4.20`) and local minikube values: external local PG, auth, OpenAI provider, stable service name |
| `helm/bifrost/networkpolicy.yaml` | Namespace-local ingress restriction for the upstream Bifrost pods |

The current runtime is pinned to `v1.4.20`, so the backend sends the v1.4-compatible virtual-key payload shape. When you move to the `v1.5.x` line later, back up the `bifrost` database first and then reintroduce the v1.5-specific virtual-key changes from the migration guide.

#### 3. `opsiforce-backend`

| Template | What it creates |
|----------|----------------|
| `deployment.yaml` | NestJS container (port 3001). Uses serviceAccount from infra chart. Health: `/api/health`. preStop: 30s sleep for graceful drain. |
| `service.yaml` | ClusterIP:80 → 3001 |
| `configmap.yaml` | All backend env vars (DATABASE_URL, REDIS_URL, K8S_NAMESPACE, AGENT_CONTAINER_IMAGE, APP_PORT, AGENT_NAME, etc.) injected via `envFrom` |
| `hpa.yaml` | HorizontalPodAutoscaler (disabled by default, CPU-based) |

#### 4. `opsiforce-frontend`

| Template | What it creates |
|----------|----------------|
| `deployment.yaml` | nginx:alpine serving static Solid.js build. Health: `/`. preStop: 30s sleep. |
| `service.yaml` | ClusterIP:80 |

#### 5. `opsiforce-proxy`

| Template | What it creates |
|----------|----------------|
| `deployment.yaml` | nginx container + OAuth2 Proxy sidecar (Keycloak OIDC). preStop: 30s sleep. |
| `service.yaml` | ClusterIP:4180 |
| `configmap.yaml` | nginx.conf — routes: `/api/proxy` (to agent runtime proxy), `/api` (to backend), `/` (to frontend) |
| `ingressroute.yaml` | Traefik IngressRoute — TLS via Let's Encrypt, external-dns annotation for automatic DNS |
| `ingressroute-bifrost.yaml` | Traefik IngressRoute for Bifrost dashboard — routes `bifrost.{dev.}opsima.com` directly to `opsiforce-bifrost:8080` |
| `ingressroute-webapp.yaml` | Wildcard app routes for public app URLs and the separate in-product preview host |

OAuth2 Proxy sidecar:
- Provider: `keycloak-oidc`
- Session store: Valkey (Redis-compatible, deployed as Helm subchart of opsiforce-proxy)
- Listens on `:4180`, upstreams to nginx on `:80`
- Passes access token, skips JWT bearer tokens, CSRF per-request

#### 5. `opsiforce-runtime-proxies`

| Template | What it creates |
|----------|----------------|
| `deployments.yaml` | Four Go deployments: agent/app/vscode/db |
| `services.yaml` | Four ClusterIP services, one per proxy mode |
| `configmap.yaml` | Shared runtime proxy env vars (backend URL, namespace, storage path) |
| `secret.yaml` | Internal control-plane token shared with backend |

### Cross-Chart Dependencies

```
opsiforce-proxy
  ├── needs service name of → opsiforce-runtime-proxies-agent (proxy.agentService)
  ├── needs service name of → opsiforce-backend  (proxy.backendService)
  └── needs service name of → opsiforce-frontend (proxy.frontendService)

opsiforce-runtime-proxies
  ├── needs service name of → opsiforce-backend  (config.backendUrl)
  └── needs PVC name from   → opsiforce (infra)  (config.cephfsPvcName)

opsiforce-backend
  ├── needs ServiceAccount from → opsiforce (infra)  (serviceAccountName)
  ├── needs PVC name from       → opsiforce (infra)  (config.cephfsPvcName)
  ├── needs agent image tag from → opsiforce (infra) (config.agentContainerImage)
  └── needs service URL from    → opsiforce-bifrost  (config.bifrostProxyUrl)
```

These are wired together via `--set` flags in the deploy step. Helm release names follow the pattern `opsiforce-{chart}-{env}`, and K8s service names are derived from the Helm fullname template.

### Rollout Strategy

All deployments use `rollme: {{ randAlphaNum 5 }}` annotation — this forces a new rollout on every `helm upgrade`, even if the image tag hasn't changed (useful when ConfigMaps change). Combined with `--wait`, each `helm upgrade` blocks until the new pods are Ready.

All containers have a `preStop: sleep 30` hook — this keeps the old pod alive for 30s after receiving SIGTERM, allowing in-flight requests to drain before the pod shuts down.

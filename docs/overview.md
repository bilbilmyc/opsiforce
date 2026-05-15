# Opsiforce Overview

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
  ├── /api/proxy/** → opsiforce-runtime-proxies-agent (Go runtime proxy)
  └── /api/**       → opsiforce-backend (NestJS — pod orchestration + control plane)
                         │
                         ├── K8s API (create/delete/watch agent pods)
                         ├── PostgreSQL (projects + pods state via Drizzle ORM)
                         ├── Redis (pod timeout TTL tracking)
                         ├── Bifrost AI Gateway (LLM proxy — virtual keys, usage tracking)
                         └── Agent Pod (opencode serve :4096 + code-server :8080 + app dev server :3000)
                                │
                                └── CephFS volume (subPath: projects/{tenant}/{project-id})
```

The frontend integrates OpenCode at the source level — OpenCode's Solid.js components (`AppBaseProviders`, `AppInterface`) are imported directly via a custom Vite resolver plugin and rendered inline (no iframe).

### Frontend integration details

- `vite.config.ts` contains `opencodeResolver()` plugin mapping `@opencode-ai/*` → `../opencode/packages/*/src/`
- `@/` alias points to OpenCode app src (for internal opencode imports), `~/` points to our src
- OpenCode sections hidden via CSS overrides + `layout.sidebar.close()` programmatic API
- Theme forced to light via `useTheme().setColorScheme("light")`
- OpenCode source at `opencode/` is imported directly, not installed as a package

---

## Services

### Local dev (frontend on host, control plane in minikube)

| Service | Where | Port | Notes |
|---------|-------|------|-------|
| **opsiforce-proxy** | Minikube pod | 80 | Local Traefik routes `https://opsiforce.localtest.me` to this proxy. |
| **Backend** | Minikube pod via Tilt | 3001 | Hot reload via Tilt's `live_update`. Mounts same hostPath as agents — file ops have parity with prod. |
| **Runtime proxies** | Minikube pods via Tilt | 3002-3005 | App, VS Code, DB, and agent traffic proxies. |
| **Frontend** | Local (Vite HMR) | 8084 | Hot reload. |
| **Bifrost** | Minikube pod | 8080 | Local upstream chart using shared PostgreSQL. |
| **PostgreSQL** | Minikube (port-forwarded) | 5435 | Shared with other sima apps. |
| **Redis** | Minikube (port-forwarded) | 6382 | Shared with other sima apps. |
| **Agent pods** | Minikube | 4096 | Dynamically created by backend. `hostPath` at `/workspace-data` inside the minikube node. |

### Production (7 K8s deployments + agent pods)

| Service | Image | Port | What it does |
|---------|-------|------|-------------|
| **opsiforce-proxy** | `nginx:1.30.1` + oauth2-proxy sidecar | 80 | Routes traffic between services. OAuth2 Proxy for auth. |
| **opsiforce-frontend** | `node:24.14-alpine` (static) | 80 | Solid.js app — projects sidebar + OpenCode UI embedded via source-level imports (Vite resolver plugin). Single SPA, no iframe. |
| **opsiforce-backend** | `node:24-alpine` | 3001 | NestJS + Fastify. Manages K8s pods, tracks timeouts, exposes internal proxy control APIs, and handles the service gateway. |
| **opsiforce-runtime-proxies-agent** | Go | 3005 | Path-based OpenCode agent proxy (`/api/proxy/:projectId/*`). |
| **opsiforce-runtime-proxies-app** | Go | 3002 | App preview subdomain proxy with request logging into project SQLite. |
| **opsiforce-runtime-proxies-vscode** | Go | 3003 | VS Code subdomain proxy with WebSocket support. |
| **opsiforce-runtime-proxies-db** | Go | 3004 | Datasette DB viewer subdomain proxy. |
| **opsiforce-agent** | `node:24-slim` + bun | 4096, 3000, 8080, 8081 | OpenCode + code-server (VS Code IDE) + app dev server + datasette DB viewer. One pod per project. CephFS subPath mount. Image tagged with commit SHA in CI/CD. Agent image version in `agent-config/agent-image-version.json` (local dev), platform version in `backend/platform-version.json`. 34 skills, 95 pre-installed packages. |

---

## Packages

```
packages/opsiforce/
├── backend/            Yarn workspace (NestJS + Fastify)
│   ├── src/
│   │   ├── main.ts              NestJS bootstrap (Fastify adapter, port 3001)
│   │   ├── app.module.ts        Root module
│   │   ├── config/              Environment configuration
│   │   ├── proxy/               Internal proxy control API + upstream resolver
│   │   ├── pod/                 K8s pod CRUD + warm pool + pod spec builder
│   │   ├── permission/           RBAC — parses Keycloak roles from x-forwarded-groups header
│   │   ├── project/             Project CRUD + auto-reassignment
│   │   ├── gateway/             Service gateway — per-project tokens for external APIs (email, SMS, etc.)
│   │   └── timeout/             Redis TTL tracking + keyspace notification listener
│   └── db/
│       ├── schema.ts            Drizzle schema (projects + pods tables)
│       ├── index.ts             Database connection
│       └── migrations/          Drizzle Kit generated SQL
│
├── proxy/           Go module (runtime proxy servers)
│   ├── cmd/opsiforce-proxy/     Single binary, mode-switched at startup
│   └── internal/                Backend client, cache, request logger, handlers
│
├── frontend/           Yarn workspace (Vite + Solid.js)
│   ├── opencode/               OpenCode source (imported at build time via Vite resolver plugin)
│   │   └── packages/           app/, ui/, util/, sdk/js/ — Solid.js components + SDK
│   └── src/                    Projects sidebar + OpenCode UI (direct source-level integration)
│       ├── app.tsx             Root: sidebar + project view routing
│       ├── pages/project.tsx   Split-pane: OpenCode chat (left) + app preview iframe (right)
│       ├── components/         Project sidebar, create dialog
│       ├── constants/          Permission string constants
│       └── api/                TanStack Query client + query factories + permissions hook
│
├── agent-config/
│   ├── agent-image-version.json  Agent Docker image version (local dev tagging)
│   ├── agents/
│   │   └── app-builder/         Default agent — template, skills, agent definition
│   │       ├── agent.md         OpenCode agent def (→ .opencode/agents/app-builder.md)
│   │       ├── config.json      Agent metadata (name, description, ports)
│   │       ├── skills/          Files synced to .opencode/skills/
│   │       └── template/        Files copied to workspace for new projects
│   ├── opencode.json            Shared config (providers, permissions, default_agent)
│   └── scripts/                 Entrypoint + guard scripts
│
├── docker/
│   ├── Dockerfile.agent         node:24-slim + bun + opencode + app template + agent-browser
│   ├── Dockerfile.backend       NestJS (multi-stage, Yarn PnP)
│   ├── Dockerfile.frontend      Solid.js app served by serve
│   └── Dockerfile.runtime-proxy Go runtime proxy image
│
└── helm/
    ├── opsiforce/               Infra: PVC, RBAC
    ├── opsiforce-proxy/         nginx + OAuth2 Proxy + Traefik IngressRoute (routes between services)
    ├── opsiforce-frontend/      Solid.js deployment + service
    ├── opsiforce-backend/       NestJS deployment + service + configmap + HPA
    ├── opsiforce-runtime-proxies/ Go runtime proxy deployments + services
    └── bifrost/                 Values + NetworkPolicy for the upstream Bifrost Helm chart
```

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

---

## Key Docs

- [Request Flows](./request-flows.md)
- [Pod Management](./pod-management.md)
- [Persistence & Storage](./persistence.md)
- [API Reference](./api-reference.md)
- [Permissions](./permissions.md)
- [Workspaces](./workspaces.md)
- [VS Code IDE](./vscode-ide.md)
- [DB Viewer](./db-viewer.md)
- [Service Gateway](./service-gateway.md)

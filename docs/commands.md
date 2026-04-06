# Commands Reference

Quick reference for all Opsiforce dev commands, ports, and local environment setup.

---

## Setup

```bash
# First time (installs minikube, PG, Redis, Keycloak, creates DB):
yarn dev-opsiforce

# Subsequent runs (minikube already set up):
yarn dev-opsiforce-only
```

Same pattern as `yarn dev-makara` / `yarn dev-makara-only`.

What `dev-opsiforce-only` starts:
- **Backend:** setup storage → build agent image → deploy infra chart → migrate DB → start NestJS (hot reload)
- **Frontend:** start Vite (HMR) — imports OpenCode from `opencode/` at build time

---

## Type Check

```bash
yarn workspace @opsiforce/backend run ts
yarn workspace @opsiforce/frontend run ts
```

---

## Database

```bash
yarn workspace @opsiforce/backend run db:generate    # Generate migration from schema changes
yarn workspace @opsiforce/backend run db:migrate     # Apply migrations
yarn workspace @opsiforce/backend run db:studio      # Visual DB browser (localhost:4983)
```

**Important:** When generating a new migration with `db:generate`, always provide a meaningful name that describes the change. Generic names make migration history unreadable.

```bash
# Good:
yarn workspace @opsiforce/backend run db:generate --name add-session-id-to-projects

# Bad:
yarn workspace @opsiforce/backend run db:generate --name migration
yarn workspace @opsiforce/backend run db:generate --name update
```

---

## Testing the API

```bash
curl http://localhost:3001/api/projects              # List projects
curl -X POST http://localhost:3001/api/projects      # Create project
curl http://localhost:3001/api/projects/{id}          # Get project
curl -X DELETE http://localhost:3001/api/projects/{id} # Delete project
curl http://localhost:3001/api/health                 # Health check
```

---

## Ports (local dev)

| Service | Port | Notes |
|---------|------|-------|
| Proxy (entry point) | 4110 | Minikube nginx, port-forwarded. Open this in browser. |
| NestJS backend | 3001 | Local, routed through proxy at /api |
| Solid.js frontend (Vite) | 8084 | Local, routed through proxy at / |
| PostgreSQL | 5435 | Minikube, port-forwarded |
| Redis | 6382 | Minikube, port-forwarded |
| Agent pods | 4096 | In minikube, per-pod |
| Drizzle Studio | 4983 | DB browser |

---

## Local Environment

- `local-envs.sh` in `backend/` has all env vars for local dev
- Vite configs must include `allowedHosts: ["host.minikube.internal"]` (proxy routes through minikube)
- Local dev uses `AGENT_IMAGE_PULL_POLICY=Never` (image built into minikube), prod uses `Always`
- Local dev follows makara pattern: apps local, proxy in minikube, access via :4110
- See [API Reference](api-reference.md) for full env var list

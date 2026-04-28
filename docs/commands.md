# Commands Reference

Quick reference for Opsiforce dev commands, ports, and local environment setup. The package README is the canonical local setup entrypoint: [`../README.md`](../README.md).

---

## Setup

```bash
# First time from repo root:
yarn install
yarn run install-all

# Daily dev: run in separate terminals from repo root:
yarn run tunnel-traefik
yarn run port-forward-all
yarn run dev-opsiforce-only
```

`tunnel-traefik` keeps the minikube LoadBalancer reachable for `*.opsiforce.traefik.me`.

What `dev-opsiforce-only` starts:
- **Backend workspace:** setup minikube storage → build agent image → deploy infra chart → create DBs → migrate DB → install Bifrost → start Drizzle Studio, Mailgun mock, and Tilt
- **Tilt:** build/deploy backend and runtime proxy dev images, live-update source into pods
- **Frontend:** start Vite (HMR) — imports OpenCode from `opencode/` at build time

Shortcut:

```bash
yarn run dev-opsiforce
```

This runs shared install + port forwards + Opsiforce, but `yarn run tunnel-traefik` still needs to run separately.

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

| Service | URL / Port | Notes |
|---------|------------|-------|
| Opsiforce app | `https://opsiforce.traefik.me` | Browser entrypoint through local Traefik |
| Project app previews | `https://{project}.apps.opsiforce.traefik.me` | Routed through runtime app proxy |
| VS Code | `https://{project}.code.opsiforce.traefik.me` | Routed through runtime VS Code proxy |
| DB viewer | `https://{project}.db.opsiforce.traefik.me` | Routed through runtime DB proxy |
| Bifrost dashboard | `https://bifrost.opsiforce.traefik.me` | Local Bifrost dashboard |
| Tilt UI | `https://tilt.opsiforce.traefik.me` | Requires `tilt up --host=0.0.0.0`, handled by backend script |
| NestJS backend | `localhost:3001` | Tilt port-forward for direct API calls |
| Node debug | `localhost:9229` | Tilt port-forward |
| Solid.js frontend | `localhost:8084` | Vite HMR on host |
| PostgreSQL | `localhost:5435` | Minikube port-forward |
| Redis | `localhost:6382` | Minikube port-forward |
| Keycloak | `localhost:8086` | Minikube port-forward |
| Drizzle Studio | `localhost:4983` | DB browser |
| Mailgun mock | `localhost:8089` | Docker mailgun mock |

---

## Local Environment

- `backend/local-envs.sh` has local backend and Bifrost bootstrap vars
- `frontend/local-envs.sh` has local app, preview, VS Code, and DB viewer domains
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are optional locally; when omitted, Bifrost provider secrets are created with empty values
- Vite config must allow `host.minikube.internal` and `.opsiforce.traefik.me` because local Traefik reaches the host Vite server from inside minikube
- Local dev uses `AGENT_IMAGE_PULL_POLICY=Never` (image built into minikube), prod uses `Always`
- Local dev uses in-cluster backend/proxies via Tilt and host Vite via Traefik
- See [API Reference](api-reference.md) for full env var list

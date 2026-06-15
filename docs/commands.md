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

`tunnel-traefik` keeps the minikube LoadBalancer reachable for `*.opsiforce.localtest.me`.

What `dev-opsiforce-only` starts:
- **Backend workspace:** setup minikube storage → build agent image → deploy infra chart → create DBs → migrate DB → install Bifrost → start Drizzle Studio, Mailgun mock, and Tilt
- **Tilt:** build/deploy backend and runtime proxy dev images, live-update source into pods
- **Frontend:** start Vite (HMR) — imports OpenCode from `opencode/` at build time

For User Management, run `yarn run dev-keycloak-ms-only` as well so `/ms-assets` and `/ms-api` have a local keycloak-ms target. This builds keycloak-ms and serves it with `vite preview` — required because the `/users` page loads keycloak-ms as a Module Federation remote (`/ms-assets/remoteEntry.js`), which only exists in a build. Do **not** use `dev-ms-only` for this: it runs keycloak-ms as a raw `vite dev` server that never emits `remoteEntry.js`, so the embedded UI fails with "Failed to load user management." (`dev-ms-only`/`dev-ms` stay around for working on the keycloak-ms app standalone with HMR.)

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

## Lint & Format

Opsiforce TS/JS uses [oxlint](https://oxc.rs/docs/guide/usage/linter) (linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) (formatter) from the Rust-based OXC toolchain — not ESLint/Prettier. Config lives at `packages/opsiforce/.oxlintrc.json` (shared base, extended per package) and `packages/opsiforce/.oxfmtrc.json`.

```bash
# Per workspace (swap @opsiforce/backend for @opsiforce/frontend):
yarn workspace @opsiforce/backend run lint          # apply safe autofixes, then report what remains (errors fail; warnings are advisory)
yarn workspace @opsiforce/backend run format        # rewrite files with oxfmt (append --check for a CI-style dry run)
yarn workspace @opsiforce/backend run check         # lint && ts — the pre-commit gate (fixes as it goes)
```

`lint` is a single pass per package, tuned to its stack: the backend (NestJS) runs type-aware rules via `oxlint-tsgolint` plus the `node`/`import`/`promise` plugins; the frontend (SolidJS) runs `jsx-a11y` plus Solid reactivity (`eslint-plugin-solid`) and solid-query (`@tanstack/eslint-plugin-query`) rules through oxlint `jsPlugins` (config auto-discovered from `frontend/oxlint.config.ts`).

The vendored `frontend/opencode/` tree is **not** linted or formatted by these commands (it is upstream code with its own toolchain).

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
curl http://localhost:3010/api/projects              # List projects
curl -X POST http://localhost:3010/api/projects      # Create project
curl http://localhost:3010/api/projects/{id}          # Get project
curl -X DELETE http://localhost:3010/api/projects/{id} # Delete project
curl http://localhost:3010/api/health                 # Health check
```

---

## Ports (local dev)

| Service | URL / Port | Notes |
|---------|------------|-------|
| Opsiforce app | `https://opsiforce.localtest.me` | Browser entrypoint through local Traefik |
| Project app previews | `https://{project}.apps.opsiforce.localtest.me` | Routed through runtime app proxy |
| VS Code | `https://{project}.code.opsiforce.localtest.me` | Routed through runtime VS Code proxy |
| DB viewer | `https://{project}.db.opsiforce.localtest.me` | Routed through runtime DB proxy |
| Bifrost dashboard | `https://bifrost.opsiforce.localtest.me` | Local Bifrost dashboard |
| Tilt UI | `https://tilt.opsiforce.localtest.me` | Requires `tilt up --host=0.0.0.0`, handled by backend script |
| NestJS backend | `localhost:3010` | Tilt port-forward for direct API calls |
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
- Vite config must allow `host.minikube.internal` and `.opsiforce.localtest.me` because local Traefik reaches the host Vite server from inside minikube
- Local dev uses `AGENT_CONTAINER_IMAGE_PULL_POLICY=Never` (image built into minikube), prod uses `Always`
- Local dev uses in-cluster backend/proxies via Tilt and host Vite via Traefik
- See [API Reference](api-reference.md) for full env var list

# DB Viewer

Browser-based SQLite viewer embedded in agent pods. Users can inspect and query the two SQLite databases present in every agent pod: the generated app's data DB and the platform's observability/logs DB.

---

## How It Works

Each agent pod runs a [Datasette](https://datasette.io/) process alongside the OpenCode agent, code-server, and app dev server. Datasette serves both databases on a single port with its own sidebar switcher.

### Components

| Component | Port | Purpose |
|-----------|------|---------|
| OpenCode agent | 4096 | AI coding assistant |
| code-server | 8080 | VS Code web IDE |
| Webapp dev server | 3000 | User app preview |
| Datasette | 8081 | DB viewer for app.db + database.db |

### Databases

| Name in viewer | File | Purpose | Writes |
|----------------|------|---------|--------|
| `app` | `/workspace/app/data/app.db` | Generated app's SQLite database (user items, etc.) | Allowed via `datasette-write-ui` plugin |
| `database` | `/workspace/data/database.db` | Platform observability DB: HTTP requests, process logs, process events | Read-only (writes rejected by metadata permissions) |

### Process management

Datasette runs as a `guard`-wrapped process in the same container as the agent, managed by `entrypoint.sh`. Startup seeds both DB files with `sqlite3 VACUUM` if missing (datasette refuses to start on absent files). Permissions are applied from `/opt/opencode/datasette-metadata.yml` (copied from `agent-config/datasette-metadata.yml` at image build).

---

## Proxy Routing

DB viewer uses **subdomain-based routing** (same approach as VS Code and webapp proxy) because Datasette serves assets at absolute paths.

| Service | Routing | Backend Port | Target |
|---------|---------|-------------|--------|
| OpenCode agent | Path-based (`/api/proxy/{id}/*`) | 3005 | pod:4096 |
| VS Code IDE | Subdomain (`{id}.code.domain`) | 3003 | pod:8080 |
| Webapp preview | Subdomain (`{id}.apps.domain`) | 3002 | pod:3000 |
| DB viewer | Subdomain (`{id}.db.domain`) | 3004 | pod:8081 |

### How it works

```
Browser → http://{projectId}.db.dev.opsima.com/
  → Traefik IngressRoute (*.db.dev.opsima.com → runtime-db-proxy:3004)
  → Go DB proxy (extracts projectId from subdomain)
  → calls backend control API for project readiness + upstream
  → proxies HTTP + WebSocket to pod:8081
```

The proxy strips `X-Frame-Options`, `Content-Security-Policy`, and `Content-Encoding` response headers for iframe compatibility.

### Local dev

In local dev, the Go DB proxy runs inside minikube via Tilt, so it reaches agent pod IPs directly on the pod network. Browser traffic enters through Traefik at `{projectId}.db.opsiforce.localtest.me`, then flows through the in-cluster opsiforce proxy to the runtime DB proxy.

---

## Frontend Integration

The project view has a tab bar (Chat / Code / DB) above the main content area:

- **Chat tab**: OpenCode AI interface (source-level Solid.js integration)
- **Code tab**: VS Code in an iframe (`{projectId}.{vscodeDomain}/?folder=/workspace`), gated by `canViewCode`
- **DB tab**: Datasette in an iframe (`{projectId}.{dbDomain}/`), gated by `canViewDb`

The DB tab is lazy-loaded — the iframe only mounts on first click. Once mounted, it stays in the DOM (toggled via CSS `display: none`) to avoid reloading when switching tabs.

Frontend env vars:
- `VITE_DB_DOMAIN` — DB proxy domain (default: `localhost:3004`, prod: `db.dev.opsima.com` / `db.opsima.com`)

---

## Authentication & Permissions

- `canViewDb` (Keycloak role `opsiforce_can_view_db_tab`) gates the DB tab in the frontend
- The wildcard DB IngressRoute goes through the platform OAuth2 Proxy before nginx forwards authenticated traffic to the runtime DB proxy
- Datasette runs with `--auth none` (default). Per-DB write permissions are enforced via `datasette-metadata.yml` (`database` DB denies insert/update/delete).

### Security note

A determined user with a valid platform OAuth2 Proxy session and knowledge of the project UUID could hit `{projectId}.db.dev.opsima.com` directly without having the `canViewDb` role. Closing that gap requires a project-aware authorization check on the runtime proxy path.

---

## Persistence

Datasette is stateless — no XDG persistence like code-server has. Each pod start re-opens the DB files fresh. `VACUUM` initialization in `entrypoint.sh` is idempotent (`[ -s file ]` guard only runs on empty/missing files).

---

## Configuration

### Runtime proxy env vars

| Env var | Default | Description |
|---------|---------|-------------|
| DB_VIEWER_PORT | 8081 | Port datasette listens on inside the pod |
| PROXY_CONTROL_TOKEN | local default | Shared backend/runtime-proxy auth token |

### Helm values

| Chart | Key | Default | Description |
|-------|-----|---------|-------------|
| opsiforce-backend | `config.dbViewerPort` | "8081" | Agent pod datasette port |
| opsiforce-runtime-proxies | `ports.db` | 3004 | DB runtime proxy port |
| opsiforce-proxy | `dbProxy.appsHostname` | db.dev.opsima.com | Wildcard domain for DB viewer |
| opsiforce-proxy | `dbProxy.backendService` | (set in CI) | Runtime proxy service name |

### CI/CD

- Frontend build arg: `VITE_DB_DOMAIN` set per environment in `.github/workflows/opsiforce.yml`
- Helm deploy: `--set dbProxy.*` values set per environment
- DNS: `*.db.dev.opsima.com` / `*.db.opsima.com` wildcard managed by external-dns via IngressRoute annotation

### Metadata file

`packages/opsiforce/agent-config/datasette-metadata.yml` controls per-DB write permissions. The `database` observability DB grants only `allow_sql` (SELECT), while `app` grants insert/update/delete/alter-table/create-table/drop-table. Edit this file to tighten or loosen access.

---

## Datasette plugins

Installed in `Dockerfile.agent` via pip:

- `datasette-write-ui` — enables row-level edit UI on writable DBs

Additional plugins can be added to the same `pip3 install` line and will be picked up on next pod start.

# Pod Tools: VS Code & DB Viewer

> The two browser tools embedded alongside the agent in every project pod — a code-server IDE and a Datasette SQLite viewer — and why both are reached through subdomain proxies rather than the path-based agent proxy.

Each environment pod runs four `guard`-supervised processes sharing the `/workspace` volume: the OpenCode agent (`:4096`), the app dev server (`:3000`), **code-server** (`:8080`), and **Datasette** (`:8081`). Because the IDE and DB viewer share the same volume the agent edits, a change in either is immediately visible to the agent and vice versa. Both appear as lazy-loaded iframe tabs (Chat / Code / DB) in the project view; once mounted, a tab stays in the DOM (toggled with `display:none`) so switching never reloads it.

## Why subdomain routing

The agent surface is path-routed (`/api/proxy/:id/*`), but code-server and Datasette both serve assets at **absolute** paths that break under a path prefix. So each gets its own subdomain — `{envId}.code…` and `{envId}.db…` — handled by a dedicated Go runtime-proxy mode. Both reach the pod the same way the agent proxy does (the shared ensure gate, then the pod IP), and both strip `X-Frame-Options`, `Content-Security-Policy`, and `Content-Encoding` from responses so the iframe can render them. See [Request Flows](request-flows.md) for the topology.

## VS Code (code-server)

code-server runs with `--auth none`: the wildcard IngressRoute already passes through the platform OAuth2 Proxy before any traffic reaches the proxy, and the pod has no public port. The proxy also strips the `Origin` header from WebSocket upgrades, because code-server's own origin check would otherwise reject the proxy's origin (safe — auth is enforced upstream). IDE state persists on the workspace volume under `/workspace/.xdg/code-server/` (settings and installed extensions), so it survives pod restarts and reassignment — the same XDG pattern OpenCode uses (see [Persistence](persistence.md)). Gated by `can_view_code_tab`.

## DB Viewer (Datasette)

Datasette serves two SQLite databases with its own sidebar switcher:

- **`app`** (`/workspace/app/data/app.db`) — the generated app's database, **writable** via the `datasette-write-ui` plugin.
- **`database`** (`/workspace/data/database.db`) — the platform observability DB (HTTP request logs, process logs/events), **read-only**.

Per-DB write permission is enforced by `agent-config/datasette-metadata.yml` (the `app` DB grants insert/update/delete; `database` grants only SELECT) — edit that file to change access. Datasette is stateless (no XDG persistence); startup seeds missing DB files with `VACUUM` because it refuses to open absent files. Gated by `can_view_db_tab`.

**Known gap:** the per-tab permission gates only the *frontend*. A user with a valid platform session who guesses the environment id can reach `{envId}.db…` directly without `can_view_db_tab`. Closing it requires a project-aware authorization check on the runtime-proxy path.

## See also

- [Request Flows](request-flows.md) — the runtime-proxy topology and the shared ensure gate (proxy modes `vscode`/`db`).
- [Persistence & Storage](persistence.md) — the `/workspace/.xdg/` layout that makes IDE state durable.
- [Permissions](../organization/permissions.md) — `can_view_code_tab` / `can_view_db_tab`.
- Code: `proxy/cmd/opsiforce-proxy/` (single binary, mode-switched), `agent-config/datasette-metadata.yml`, `agent-config/scripts/entrypoint.sh` (guard-wrapped processes), `docker/Dockerfile.agent` (datasette plugins). Frontend tabs in `frontend/src/components/project/`.

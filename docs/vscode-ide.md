# VS Code IDE

Browser-based VS Code (code-server) embedded in agent pods for terminal, file management, and editing.

---

## How It Works

Each agent pod runs code-server alongside the OpenCode agent. Both share the same `/workspace` volume — files edited in VS Code are immediately visible to the AI agent and vice versa.

### Components

| Component | Port | Purpose |
|-----------|------|---------|
| OpenCode agent | 4096 | AI coding assistant |
| code-server | 8080 | VS Code web IDE |
| Webapp dev server | 3000 | User app preview |

### Process management

All processes run in the same container, managed by the `guard` wrapper in `entrypoint.sh`.

---

## Proxy Routing

VS Code uses **subdomain-based routing** (same approach as the webapp proxy) because code-server serves assets at absolute paths that break under path-based reverse proxies.

| Service | Routing | Backend Port | Target |
|---------|---------|-------------|--------|
| OpenCode agent | Path-based (`/api/proxy/{id}/*`) | 3005 | pod:4096 |
| VS Code IDE | Subdomain (`{id}.code.domain`) | 3003 | pod:8080 |
| Webapp preview | Subdomain (`{id}.apps.domain`) | 3002 | pod:3000 |

### How it works

```
Browser → http://{projectId}.code.dev.opsima.com/
  → Traefik IngressRoute (*.code.dev.opsima.com → runtime-vscode-proxy:3003)
  → Go VS Code proxy (extracts projectId from subdomain)
  → calls backend control API for project readiness + upstream
  → proxies HTTP + WebSocket to pod:8080
```

### Local dev

In local dev, the Go VS Code proxy runs inside minikube via Tilt, so it reaches agent pod IPs directly on the pod network. Browser traffic enters through Traefik at `{projectId}.code.opsiforce.traefik.me`, then flows through the in-cluster opsiforce proxy to the runtime VS Code proxy.

### WebSocket

The proxy handles WebSocket upgrades with Go's `httputil.ReverseProxy`. The `origin` header is stripped from WebSocket requests — code-server performs origin checking that would reject the proxy's origin. This is safe because authentication is handled at the proxy layer.

---

## Persistence

VS Code state stored on persistent volume at `/workspace/.xdg/code-server/`:

| Path | What |
|------|------|
| `/workspace/.xdg/code-server/user-data/` | Settings, keybindings, UI state |
| `/workspace/.xdg/code-server/extensions/` | Installed extensions |

This follows the same XDG pattern as OpenCode (`/workspace/.xdg/share/opencode/`). Both survive pod restarts and reassignment.

### Extensions

Users install extensions via the VS Code UI — these persist on the volume across pod restarts.

---

## Frontend Integration

The project view has a tab bar (Chat / Code) above the main content area:

- **Chat tab**: OpenCode AI interface (source-level Solid.js integration)
- **Code tab**: VS Code in an iframe (`{projectId}.{vscodeDomain}/?folder=/workspace`)

The Code tab is lazy-loaded — the iframe only mounts on first click. After that, both panels stay in the DOM (toggled via CSS `display: none`) to avoid reloading when switching tabs.

Frontend env vars:
- `VITE_VSCODE_DOMAIN` — VS Code proxy domain (default: `localhost:3003`, prod: `code.dev.opsima.com`)

---

## Authentication

No separate VS Code authentication. code-server runs with `--auth none` because the wildcard VS Code IngressRoute goes through the platform OAuth2 Proxy before nginx forwards authenticated traffic to the runtime VS Code proxy. The pod is only reachable through the internal proxy path and has no public port.

The proxy strips `X-Frame-Options`, `Content-Security-Policy`, and `Content-Encoding` response headers for iframe compatibility.

---

## Configuration

### Runtime proxy env vars

| Env var | Default | Description |
|---------|---------|-------------|
| VSCODE_PORT | 8080 | Port code-server listens on inside the pod |
| PROXY_CONTROL_TOKEN | local default | Shared backend/runtime-proxy auth token |

### Helm values

| Chart | Key | Default | Description |
|-------|-----|---------|-------------|
| opsiforce-backend | `config.vscodePort` | 8080 | Agent pod code-server port |
| opsiforce-runtime-proxies | `ports.vscode` | 3003 | VS Code runtime proxy port |
| opsiforce-proxy | `vscodeProxy.appsHostname` | code.dev.opsima.com | Wildcard domain for VS Code |
| opsiforce-proxy | `vscodeProxy.backendService` | (set in CI) | Runtime proxy service name |

### CI/CD

- Frontend build arg: `VITE_VSCODE_DOMAIN` set per environment in `.github/workflows/opsiforce.yml`
- Helm deploy: `--set vscodeProxy.*` values set per environment
- DNS: `*.code.dev.opsima.com` wildcard managed by external-dns via IngressRoute annotation

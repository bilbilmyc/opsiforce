# Opsiforce

Opsiforce local development runs the backend, runtime proxies, Bifrost, and project pods inside minikube. Tilt is required for the backend and proxy dev loop.

## Prerequisites

Install these tools before running the Opsiforce dev environment:

- Docker-compatible local container runtime
- minikube
- kubectl
- Helm
- Tilt
- mkcert
- Go 1.26.2 for local proxy tests and direct proxy builds
- Node.js with Corepack enabled

On macOS, Tilt can be installed with:

```bash
brew install tilt-dev/tap/tilt
```

Verify the required CLIs are available:

```bash
docker version
minikube version
kubectl version --client
helm version
tilt version
mkcert --version
corepack --version
```

## Local Development

Opsiforce local development uses the shared Sima minikube stack:

- PostgreSQL, Redis, Keycloak, and Traefik are installed by root scripts.
- The frontend runs on the host through Vite HMR.
- The backend, runtime proxies, Bifrost, opsiforce proxy, and project pods run inside minikube.
- Tilt builds the backend and runtime proxy dev images, deploys them into the `local` namespace, and live-updates backend/proxy source changes.
- Traefik exposes the browser entrypoints under `*.opsiforce.localtest.me`.

Before running local scripts, make sure your Kubernetes context points at minikube, not a shared cluster:

```bash
kubectl config current-context
```

### First-Time Setup

From the repository root:

```bash
yarn install
yarn run install-all
```

`install-all` starts minikube and installs shared local infrastructure: PostgreSQL, Redis, Keycloak, local Traefik, TLS certs, and host entries used by the Sima local stack.

### Daily Development

Run these from the repository root in separate terminals:

```bash
yarn run tunnel-traefik
```

```bash
yarn run port-forward-all
```

```bash
yarn run dev-opsiforce-only
```

`tunnel-traefik` keeps the minikube LoadBalancer reachable from the host. It may ask for sudo and must stay running while using `https://opsiforce.localtest.me`.

`port-forward-all` keeps PostgreSQL, Redis, Keycloak, and Keycloak configuration available to local processes.

`dev-opsiforce-only` starts the Opsiforce backend workspace and frontend workspace:

- backend storage setup in minikube
- local agent image build into minikube
- Opsiforce infra Helm install
- Opsiforce and Bifrost DB creation
- Drizzle migrations
- Bifrost Helm install
- Drizzle Studio
- Mailgun mock
- Tilt backend/proxy loop
- Vite frontend server

### Shortcut

For a slower all-in-one startup, use:

```bash
yarn run dev-opsiforce
```

This runs `install-all`, `port-forward-all`, and `dev-opsiforce-only`. It does not replace `yarn run tunnel-traefik`; keep the Traefik tunnel running separately.

### Backend-Only Flow

The backend workspace exposes the in-cluster dev flow directly:

```bash
yarn workspace @opsiforce/backend run minikube-dev
```

Use this only when the shared infrastructure is already up and you do not need to start the frontend workspace from the root script.

## Local URLs

| Service | URL |
|---|---|
| Opsiforce app | `https://opsiforce.localtest.me` |
| Project app previews | `https://{project}.apps.opsiforce.localtest.me` |
| Project preview snapshots | `https://{project}.preview.apps.opsiforce.localtest.me` |
| VS Code | `https://{project}.code.opsiforce.localtest.me` |
| DB viewer | `https://{project}.db.opsiforce.localtest.me` |
| Bifrost dashboard | `https://bifrost.opsiforce.localtest.me` |
| Tilt UI | `https://tilt.opsiforce.localtest.me` |
| Backend direct port-forward | `http://localhost:3001` |
| Frontend Vite server | `http://localhost:8084` |
| Drizzle Studio | `http://localhost:4983` |

## Useful Commands

```bash
yarn workspace @opsiforce/backend run ts
yarn workspace @opsiforce/frontend run ts
yarn workspace @opsiforce/backend run build
yarn workspace @opsiforce/frontend run build
yarn workspace @opsiforce/backend run db:migrate
yarn workspace @opsiforce/backend run db:studio
yarn workspace @opsiforce/backend run tilt:down
```

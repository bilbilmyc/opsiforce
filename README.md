# Opsiforce

Opsiforce is a self-hostable platform that embeds an AI coding assistant (powered by [OpenCode](https://github.com/sst/opencode)) into your own infrastructure. A user converses with an agent inside an isolated Kubernetes pod to build an app, then promotes that app from its working environment to production-like ones. Each running unit gets its own pod with persistent storage.

For the full picture of what Opsiforce is and how the pieces fit together, start with [docs/overview.md](docs/overview.md); the documentation index is [docs/README.md](docs/README.md) and the domain vocabulary is in [CONTEXT.md](CONTEXT.md).

## How it runs

Opsiforce is a Kubernetes-native platform, and local development mirrors that: the backend, the runtime proxies, Bifrost, and the per-project agent pods all run inside a local Kubernetes cluster (minikube). [Tilt](https://tilt.dev/) drives the backend and proxy dev loop — building images into the cluster and live-updating source changes — while the frontend runs on the host through Vite HMR. Browser entrypoints are exposed under `*.opsiforce.localtest.me` (`localtest.me` resolves to `127.0.0.1`, so no host-file edits are needed).

The platform expects a few supporting services to be reachable in the cluster: PostgreSQL (for the control plane and Bifrost), Redis (timeout TTLs and event pub/sub), and an OIDC identity provider (for sign-in and managed App Auth). The local dev flow provisions the application databases and installs the in-cluster components for you; bring the backing PostgreSQL/Redis up in the cluster first.

## Prerequisites

Install these tools before running Opsiforce locally:

- Docker-compatible local container runtime
- minikube
- kubectl
- Helm
- Tilt
- mkcert
- Go 1.26.2 (for local proxy tests and direct proxy builds)
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

Before running anything, make sure your Kubernetes context points at your local minikube cluster, not a shared one:

```bash
kubectl config current-context
```

## Local Development

From the repository root, install dependencies once:

```bash
yarn install
```

### Backend and in-cluster stack

The backend workspace owns the in-cluster dev flow. With minikube running and the backing PostgreSQL/Redis available in the cluster, start everything with:

```bash
yarn workspace @opsiforce/backend run minikube-dev
```

This sets up minikube storage, builds the agent image into minikube, installs the Opsiforce infra Helm chart, creates the application databases, runs Drizzle migrations, installs Bifrost, and then runs Drizzle Studio, a Mailgun mock, and the Tilt backend/proxy loop together. Local environment values are read from `backend/local-envs.sh`.

To bring the Tilt-managed resources up or down on their own:

```bash
yarn workspace @opsiforce/backend run tilt:up
yarn workspace @opsiforce/backend run tilt:down
```

### Frontend

The frontend runs on the host with Vite HMR:

```bash
yarn workspace @opsiforce/frontend run dev
```

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
| Backend (Tilt port-forward) | `http://localhost:3010` |
| Frontend Vite server | `http://localhost:8084` |
| Drizzle Studio | `http://localhost:4983` |

## Useful Commands

```bash
yarn workspace @opsiforce/backend run ts
yarn workspace @opsiforce/frontend run ts
yarn workspace @opsiforce/backend run lint           # oxlint (type-aware on backend; Solid + solid-query rules on frontend)
yarn workspace @opsiforce/backend run format         # oxfmt
yarn workspace @opsiforce/backend run check          # lint + typecheck
yarn workspace @opsiforce/backend run build
yarn workspace @opsiforce/frontend run build
yarn workspace @opsiforce/backend run db:migrate
yarn workspace @opsiforce/backend run db:studio
yarn workspace @opsiforce/backend run tilt:down
```

Day-to-day command reference and local ports: [docs/development/commands.md](docs/development/commands.md).

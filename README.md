# Opsiforce

Opsiforce is a self-hostable, white-label platform for building and running AI-generated apps inside your own infrastructure. It gives users a chat interface backed by an isolated Linux/Kubernetes workspace where an agent can write real code, run commands, install packages, edit files, inspect data, and serve the resulting app through the platform.

It is meant to be an open alternative to products like Lovable, Base44, and AI coworker-style app builders, but with a different assumption: the generated app should not be locked to one frontend framework, one backend runtime, or one database. Each app runs in a generic container with a persistent filesystem, project-level credentials, environment-specific configuration, and HTTPS routes managed by the platform.

Community: [Join the Opsiforce Discord](https://discord.gg/kMUW2zR4R)

## Demo

[![Watch the Opsiforce demo](https://opsima-static-html.s3.us-east-1.amazonaws.com/s1-im.png)](https://www.youtube.com/watch?v=3Z3u4DJovnA)

[Watch the demo on YouTube](https://www.youtube.com/watch?v=3Z3u4DJovnA)

## Why Opsiforce Exists

Most AI app builders are good at producing a quick CRUD screen on a hosted stack. That is useful, but it is not enough if you want to embed AI app building into a product, run it in your own cloud, connect it to internal systems, or let users build more than a React + Supabase app.

Opsiforce is designed for teams that want:

- A self-hostable AI app builder they can run in their own Kubernetes environment.
- A white-label experience that can be embedded into an existing product.
- Real code generation rather than low-code graph execution.
- Persistent workspaces, files, databases, chat history, and IDE state across pod restarts.
- A generic runtime that can support different frameworks, languages, tools, and databases.
- Multiple environments, such as Development, Production, and custom environments.
- Reverse-proxied HTTPS routes for every app, preview, code editor, and database viewer surface.
- Organization-level SSO, RBAC, settings, budgets, resources, and operational visibility.

## What It Can Build

Opsiforce is not limited to one application template. The app runs inside a normal containerized workspace, so the agent can build whatever the configured toolchain supports.

Typical uses include:

- Internal dashboards, charts, reports, and admin screens.
- Forms and workflow tools for operations teams.
- Customer-specific portals embedded into an existing product.
- Data analysis apps that process uploaded files or connect to services.
- Middleware and integration apps that call APIs, send email, or run scheduled jobs.
- Full-stack apps in Node.js, Python, or other stacks available in the agent image.
- Apps that use SQLite in the persisted workspace, external databases, or any database reachable from the runtime.

The important distinction is that Opsiforce provides the workspace, hosting, proxying, persistence, identity, and agent control plane. The app itself is just code running in the project environment.

## Core Capabilities

| Capability | What Opsiforce Provides |
|---|---|
| AI coding workspace | A chat-driven agent powered by OpenCode, embedded into the Opsiforce frontend rather than iframed as a separate product. |
| Isolated runtime | Every running project environment gets its own Kubernetes pod with an app server, OpenCode agent, VS Code web IDE, database viewer, and persistent workspace volume. |
| Persistent filesystem | Source code, git history, OpenCode session data, app SQLite databases, generated files, IDE settings, and uploaded files survive pod replacement. |
| Generic app container | The runtime is not tied to React, Supabase, or a fixed backend. Apps can use the packages, tools, databases, and services available to the container and network. |
| Built-in hosting | Apps are served from the same pod and exposed through runtime proxies with project/environment-specific hostnames. |
| Reverse proxy and SSL | App, preview, code, database, and platform routes are designed to sit behind the platform edge proxy with HTTPS for every project/app surface. |
| Multiple environments | Every project starts in Development and can publish into Production or custom environments. Each environment has its own pod, files, URLs, auth mode, schedules, and environment variables. |
| Incremental publishing | Publishing uses git to move tracked source from Development into another environment, preserving runtime state such as production databases and environment-specific config. |
| App auth | Each environment can be public, manually protected by the owner's OIDC provider, or protected by a managed provider configured by the platform operator. |
| LLM gateway | Bifrost gives each project virtual LLM keys, usage tracking, and budget enforcement without exposing real provider keys to pods. |
| Service gateway | Agent-built apps can call centrally managed services, such as email, through per-project gateway tokens instead of raw provider credentials. |
| Schedules | Agents can register per-environment recurring jobs that wake suspended apps, call internal endpoints, and record execution results. |
| Admin and settings | Organizations get permission-gated settings for users, workspaces, environments, integrations, defaults, billing, and operational pod visibility. |

## Architecture in Brief

Opsiforce is a Kubernetes-native control plane plus a set of runtime proxies.

```text
Browser
  -> Edge proxy / OAuth2 Proxy
  -> Opsiforce frontend and backend
  -> Runtime proxies for agent, app, VS Code, and DB viewer
  -> Isolated project-environment pod
       - OpenCode agent on :4096
       - User app on :3000
       - code-server on :8080
       - Datasette DB viewer on :8081
       - Persistent /workspace volume
```

The backend is the control plane. It creates and wakes pods, manages projects and environments, writes settings, enforces permissions, talks to Kubernetes, and manages gateway credentials. It does not stream app traffic. The Go runtime proxies carry traffic to the right pod after checking with the backend that the environment is ready.

Each project environment is disposable at the pod layer and durable at the workspace layer. If a pod is suspended, evicted, restarted, or recreated, the same persistent workspace is mounted back into the next pod.

## How It Differs From Alternatives

The point is not that the alternatives are bad. Each category is strong for its intended job. Opsiforce combines parts of several categories for teams that want AI-generated apps, real hosting, persistence, and product integration in one self-hostable system.

| Alternative | Good At | Common Limits | Opsiforce Difference |
|---|---|---|---|
| Lovable / Base44-style app builders | Fast app generation from chat, instant previews, simple CRUD apps. | Usually opinionated around a narrow stack, hard to white-label, limited backend/runtime control, often dependent on external services for missing primitives. | Provides the chat-to-app experience, but runs apps in generic persistent containers that can be hosted, branded, and embedded inside your product. |
| n8n / Zapier-style automation | Visual workflows, integrations, hosted automation, simple business processes. | Complex logic becomes awkward, arbitrary packages and command execution are limited, and end-user UX can become workflow-builder-centric. | Uses real code in a full workspace, so complex app logic, custom packages, dashboards, forms, and long-lived app state are natural. |
| Agent builders from model providers | Strong reasoning, managed model access, broad open-ended tasks. | They are usually not deterministic app platforms, do not provide a full app hosting lifecycle, and do not give product-ready environment management. | Wraps the agent in a product platform: projects, pods, environments, hosting, credentials, budgets, permissions, and admin surfaces. |
| Raw Kubernetes / Cloud Run / AWS | Maximum flexibility, any language, any database, production-grade infrastructure. | Requires architecture, DevOps, deployment pipelines, identity wiring, cost controls, and a user-facing AI builder on top. | Keeps the flexibility of containers and Kubernetes while adding the AI builder, runtime proxies, persistence model, and product control plane. |
| Claude Code / local AI coding assistants | Excellent at writing code, using a terminal, and working inside a filesystem. | No built-in multi-user hosting, environment publishing, SSL routing, service gateways, persistent cloud workspaces, or admin controls. | Gives each project a cloud-hosted coding workspace with persistent storage, live app URLs, VS Code, DB viewer, gateways, and Organization controls. |

## Product Integration

Opsiforce can be used as a standalone internal platform, but it is also designed to be integrated into another product.

Integration-oriented features include:

- White-label frontend and product surface.
- SSO/OIDC-based authentication through the platform edge.
- Permission strings that flow from identity provider groups into backend enforcement and frontend gating.
- Per-organization workspaces, users, environments, integrations, defaults, and billing settings.
- App catalog pinning for surfacing generated apps to the wider organization.
- Environment-level app auth for public apps, managed auth, or app-owned OIDC.
- Service gateway patterns for connecting generated apps to product-provided services without leaking credentials.

This makes Opsiforce useful as infrastructure for products that want to let customers or internal users create their own dashboards, reports, operational screens, forms, and tools without leaving the product boundary.

## Environment Model

Opsiforce separates a Project from the environments that actually run it.

- A Project is the durable shell: ownership, workspace, agent, budgets, resources, and cross-environment policy.
- A ProjectEnvironment is the running thing: pod, workspace directory, public URLs, auth mode, schedules, environment variables, and app state.

Every project has a Development environment. It can publish into Production or custom environments such as Staging. Publishing copies tracked source from Development into the target while preserving target-specific state like databases and environment variables.

This is what lets a user iterate with the agent in Development, review the result, and then publish into a stable environment without treating every AI-generated change as immediately live.

## Runtime and Persistence

Opsiforce treats pods as replaceable and workspaces as durable.

The persistent workspace stores:

- App source and git history.
- OpenCode session database and chat history.
- App SQLite databases and generated output.
- Uploaded files.
- Agent config and skills copied into the workspace.
- VS Code settings and extensions.

The pod can be suspended when idle and recreated later against the same workspace. This is different from a stateless preview container: the app, code, conversation, generated files, and local databases continue to exist across runtime churn.

## Documentation

Start with these docs when working on the system:

- [Overview](docs/overview.md) for the architecture and package map.
- [Documentation index](docs/README.md) for the complete doc tree.
- [Domain vocabulary](CONTEXT.md) for canonical product language.
- [Project Environments](docs/projects/environments.md) for Development, Production, publishing, auth, and environment variables.
- [Persistence](docs/runtime/persistence.md) for workspace durability and pod replacement.
- [Request Flows](docs/runtime/request-flows.md) for how browser traffic reaches each pod surface.
- [LLM Gateway](docs/gateways/llm-gateway.md) and [Service Gateway](docs/gateways/service-gateway.md) for credential isolation.

## License

Opsiforce is licensed under the [GNU Affero General Public License v3.0](LICENSE).

---

## Original README

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

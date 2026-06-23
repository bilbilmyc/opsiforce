# Opsiforce Overview

> The orientation doc: what Opsiforce is, how the pieces fit, and where to read next. Start here.

Opsiforce is a self-hostable platform that embeds an AI coding assistant (powered by [OpenCode](https://github.com/sst/opencode)). A user converses with an agent inside an isolated Kubernetes pod to build an app, then promotes that app from its working environment to production-like ones. Each running unit — a **ProjectEnvironment** — gets its own pod with persistent storage; a **Project** is the shell that groups them. (The domain vocabulary is defined in [`../CONTEXT.md`](../CONTEXT.md) — it is the source of truth for terms like Project, Environment, App, and Organization.)

## How the pieces fit

```
Browser
  │
  ▼
opsiforce-proxy (nginx + OAuth2 Proxy)
  ├── /              → frontend (Solid.js: projects sidebar + OpenCode UI, embedded inline)
  ├── /api/proxy/**  → agent runtime proxy (Go)  ─┐
  ├── {env}.apps/code/db…  → app/vscode/db proxies │  consult backend /ensure,
  └── /api/**        → backend (NestJS control plane)   then stream to the pod
                          │
                          ├── Kubernetes API   (create/watch agent pods)
                          ├── PostgreSQL        (projects, environments, settings)
                          ├── Redis             (timeout TTLs, event pub/sub)
                          └── Bifrost           (LLM proxy — virtual keys, usage)
                                 │
                          Agent Pod: opencode :4096 · app :3000 · code-server :8080 · datasette :8081
                                 └── persistent workspace volume (CephFS / hostPath)
```

The backend is a **pure control plane** — it does not stream project traffic; the four Go runtime proxies do that ([Request Flows](runtime/request-flows.md)).

## The distinctive bit: OpenCode is embedded at the source level

The frontend does not iframe OpenCode — it imports OpenCode's Solid.js components (`AppBaseProviders`, `AppInterface`) directly via a custom Vite resolver that maps `@opencode-ai/*` to the vendored `frontend/opencode/` source, and renders them inline in our own SPA. This is why `frontend/opencode/` is read-only vendored source (not an npm dependency), why the `@/` alias points into OpenCode and `~/` into our code, and why integration quirks (shared QueryClient, theme forcing) need care. See the [Query Adapter](frontend/query-adapter.md) for one consequence.

## Packages

```
packages/opsiforce/
├── backend/        NestJS + Fastify control plane (pod orchestration, gateways, control APIs)
├── proxy/          One Go binary, mode-switched into the agent/app/vscode/db runtime proxies
├── frontend/       Vite + Solid.js SPA; frontend/opencode/ is vendored OpenCode source
├── agent-config/   Agent profiles, skills, templates, plugins, pod scripts (baked into the agent image)
├── docker/         Dockerfile.{backend,frontend,agent,runtime-proxy} (4 images)
└── helm/           6 charts: opsiforce(infra), bifrost, *-backend, *-frontend, *-runtime-proxies, *-proxy
```

## See also

The full, current documentation index is in [README.md](README.md). The essentials:

- [Commands](development/commands.md) and [`../README.md`](../README.md) — dev setup and day-to-day commands.
- [Request Flows](runtime/request-flows.md) + [Pod Lifecycle](runtime/pod-lifecycle.md) — how a request reaches a pod and how pods are managed.
- [Project Environments](projects/environments.md) — the Project/Environment/publish model that shapes everything else.
- [Deployment](development/deployment.md) — CI/CD and the rollout order.
- Architectural decisions are recorded as [ADRs](adr/).

# Local orchestration — the tunnel, Tilt, and the static dev identity

> How `yarn dev` (the [Quickstart](../quickstart.md)) brings the whole stack up and keeps
> it running under one view. For the LLM choice, see
> [ADR-0018](../adr/0018-standalone-llm-access-via-codex-proxy.md). Local ports are in
> [Commands](commands.md). This is orientation — `scripts/spin-up.mjs` and `backend/Tiltfile`
> are the reference.

The Quickstart is a zero-dependency Node orchestrator (`scripts/spin-up.mjs`) that walks a
fixed sequence of numbered steps — prerequisites, the cluster, infra and TLS, dependency
install, images, databases, the LLM gateway, the LLM choice — and then hands the running
system over to two long-lived processes: a **network tunnel** and **Tilt**. Every step is
idempotent; a failed step prints the error and resumes there on the next run.

## The tunnel is the one privileged step

`minikube tunnel` is the only thing that needs administrator access — it routes localhost
`:443` to the cluster's Traefik load balancer so `https://opsiforce.localtest.me` resolves.
The Quickstart starts it up front so the elevated prompt is clear and isolated: it primes
`sudo` once (the single password prompt), then launches the tunnel detached, logging to
`~/.opsiforce/logs/tunnel.log`. The tunnel survives the Quickstart exiting; a re-run detects
the already-running tunnel and skips the prompt. `yarn dev --reset` stops it.

## Tilt is the single process orchestrator

Everything else that runs continuously is a Tilt resource, so the stack lives under one UI
(`https://tilt.opsiforce.localtest.me`, or `http://localhost:10350`) with per-process logs,
status, and a **restart button per service** — no scrambled multi-process firehose, and no
restarting the world to recover one piece. Tilt resolves real dependency ordering between
resources (the proxy waits on the backend and runtime proxies).

Two kinds of resource share the one view:

- **In-cluster workloads** — the backend, the four runtime proxies, and the `opsiforce-proxy`
  ingress in **static** auth mode (see below). Tilt builds their images straight into
  minikube's daemon and deploys the Helm charts.
- **Host-side `local_resource`s** — the frontend dev server (Vite), the codex proxy (only on
  the subscription LLM path; it reads the recorded choice from `~/.opsiforce/config.json`),
  data-store port-forwards for poking Postgres/Redis from host tools, and an optional mail
  stub that is off by default (a single static user never sends mail). The cluster reaches the
  host ones over `host.minikube.internal`.

The `up` step starts `tilt up` detached (so the host resources outlive the Quickstart),
waits until the core services report healthy, then opens the app. Because the tunnel and Tilt
are reconciled on every run rather than cached, a day-two `yarn dev` fast-paths straight to a
healthy stack.

## Why the app opens already signed in

There is no identity provider locally. In static mode the `opsiforce-proxy` nginx drops the
oauth2-proxy sidecar and instead injects a fixed local identity on backend-bound requests — a
`test` user, the `local` tenant, and **every** permission the backend defines (the chart's list
is kept identical to the permission enum, so there are no permission walls). The backend
treats those headers as authoritative and **auto-provisions** the tenant, the user, and its
**Development and Production** environments on the first request, so there is no seeding step.
The backend's `OIDC_PLUGIN_SECRET` is set to a non-empty value in its local values, which it
requires to boot and to apply the App Auth middleware that protects built apps.

Open `https://opsiforce.localtest.me` and you land in the `local` organization with full
admin access, ready to create a Project.

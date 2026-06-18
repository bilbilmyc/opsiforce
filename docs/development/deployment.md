# Deployment

> How Opsiforce ships to a cluster: what builds, the order it deploys in and why, and the rollout mechanics. The workflow file and Helm charts are the source of truth for the exact commands; this explains the shape.

CI/CD is a single GitHub Actions workflow, `.github/workflows/opsiforce.yml`. It builds **4 Docker images** in parallel (backend, frontend, agent, runtime-proxies — all in one GHCR repo, distinguished by tag prefix) and then deploys **6 Helm charts** sequentially to the target cluster. Pushes to `main` deploy to the development namespace; pushes to `production-opsiforce` deploy to production; PRs build only.

## Deploy order is a dependency chain

The six charts must apply in this order because each depends on what came before — this is the durable fact to preserve:

```
1. opsiforce (infra)   creates the ServiceAccount + CephFS PVC everything else mounts/uses
2. bifrost             must be up before the backend (backend calls its Admin API on boot)
3. opsiforce-backend   must be up before the proxies (they call its control API)
4. opsiforce-frontend  ─┐ both must exist before the edge proxy routes to them
5. runtime-proxies     ─┘ (four Go deployments — agent/app/vscode/db — from one image)
6. opsiforce-proxy     nginx + OAuth2 Proxy + Traefik IngressRoutes; fans out to all of the above
```

The charts are wired together with `--set` flags carrying service names, the agent image tag, the PVC name, and the Bifrost URL across the boundaries above. Release names follow `opsiforce-{chart}-{env}`.

## Image tagging

Each image gets a versioned tag plus a stable pointer: `{component}-{env}-{sha7}` and `{component}-{env}` (e.g. `backend-development-abc1234` and `backend-development`). PRs tag `{component}-pr-{n}-{sha7}` and are not pushed. The agent image's tag is what the backend chart injects as `AGENT_CONTAINER_IMAGE`, so a deploy pins every new pod to that build.

## Rollout mechanics

- **Forced rollout** — every deployment carries a `rollme: {{ randAlphaNum 5 }}` annotation, so `helm upgrade` rolls pods even when the image tag is unchanged (needed when only a ConfigMap changed). Combined with `--wait`, each chart blocks until its pods are Ready.
- **Graceful drain** — every container has a `preStop: sleep 30` hook, keeping the old pod serving in-flight requests for 30s after SIGTERM before it exits.

## Bifrost version

The upstream Bifrost chart is deployed from its public Helm repo, with the running image pinned to **`v1.5.3`** in `helm/bifrost/values.{prod,local}.yaml`. The backend speaks the v1.5 Admin-API payload shape; see [LLM Gateway § Version](../gateways/llm-gateway.md#version) for the upgrade caveat (verify the running pod image, not just the chart value).

## See also

- [`../README.md`](../../README.md) / [Commands](commands.md) — running and developing locally.
- [LLM Gateway](../gateways/llm-gateway.md) — the Bifrost chart and why it deploys before the backend.
- [Pod Lifecycle](../runtime/pod-lifecycle.md) — how the agent image tag a deploy pins becomes the pod the platform runs.
- Source of truth: `.github/workflows/opsiforce.yml` and `helm/`.

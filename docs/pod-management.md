# Pod Management

Warm pool behavior, assigned pod lifecycle, and pod-level runtime details.

---

## Pod lifecycle

The backend keeps `WARM_POOL_SIZE` warm pods available. Warm pods do not mount a project `subPath`.

```
WARM -> claimed -> warm row deleted atomically -> warm pod deleted (in parallel with assigned pod deletion below)
     -> any existing assigned pod deleted
     -> new assigned pod created with project subPath -> ACTIVE

ACTIVE -> both TTL keys expire -> pod deleted -> SUSPENDED
ACTIVE -> pod deleted externally -> next access triggers recreate -> ACTIVE
ACTIVE -> project deleted -> pod deleted -> project removed
```

If no warm pod is available, the backend skips the warm pod step and creates the assigned pod directly (after deleting any existing one).

Assigned pod creation is serialized per project with a PostgreSQL advisory lock. Warm-pod claiming is serialized with `FOR UPDATE SKIP LOCKED`.

---

## Naming

- Warm pods: `opsiforce-agent-{uuid[:8]}`
- Assigned pods: `opsiforce-agent-{projectId[:8]}`

Assigned names are deterministic so a restarted backend can reconcile an already-running project pod.

---

## Why warm pods are recreated

Warm pods do not know the target `subPath` ahead of time. Kubernetes volume mounts are immutable after pod creation, so assignment works like this:

1. Claim a warm pod row
2. Delete the warm pod
3. Create a fresh assigned pod with the correct `subPath`

Opsiforce never patches a live pod to switch `subPath`.

---

## Warm pool replenishment

The pool is replenished when:

- backend starts
- a warm pod is claimed
- a project pod is suspended and deleted
- a project is deleted

`PodPoolService.cleanupOrphanedPods()` removes K8s pods that are not linked to any `pods` row or `projects.pod_name`.

---

## Labels

| Label | Value | Purpose |
|-------|-------|---------|
| `app` | `opsiforce-agent` | Identifies all agent pods |
| `opsiforce.io/pool` | `warm` or `assigned` | Pool membership |
| `opsiforce.io/project-id` | `{projectId}` | Linked project for assigned pods |

---

## Readiness

```yaml
readinessProbe:
  httpGet:
    path: /global/health
    port: 4096
  initialDelaySeconds: 3
  periodSeconds: 5
```

The backend waits for:

- pod `Ready` condition = `True`
- `podIP` present

`PodService.waitForReady()` polls every 2 seconds with a 60-second timeout.

---

## Restart policy

`restartPolicy: Always`

If the agent container crashes inside an existing pod, Kubernetes restarts the container in place. If the pod itself disappears, Opsiforce recreates it on the next access.

---

## Ports

| Port | Service |
|------|---------|
| 4096 | OpenCode agent |
| 8080 | code-server |
| 3000 | App preview |

---

## Pod template configuration

These remain deployment-time settings, not runtime overrides:

- image
- image pull policy
- resources
- nodeSelector
- tolerations
- affinity
- imagePullSecrets
- storage backend

Local development uses minikube with `hostPath`. Cluster deployments use CephFS.

---

## Bifrost integration

When Bifrost is enabled, assigned pods receive per-project virtual keys instead of the shared OpenAI key.

| Env var | Without Bifrost | With Bifrost |
|---------|----------------|--------------|
| `OPENAI_API_KEY` | Shared OpenAI key | Project chat virtual key |
| `OPENAI_BASE_URL` | Default OpenAI base URL | Bifrost pod URL |

The app-builder template also receives backend-facing Bifrost credentials through the pod environment.

---

## Agent config injection

The agent image bakes config into `/opt/...`, and an init container copies it onto the mounted workspace at startup.

| Source in image | Destination on volume |
|---|---|
| `/opt/opencode/opencode.json` | `/workspace/.xdg/config/opencode/opencode.json` |
| `/opt/agents/{AGENT_NAME}/agent.md` | `/workspace/.opencode/agents/{AGENT_NAME}.md` |
| `/opt/agents/{AGENT_NAME}/template/` | `/workspace/` |

This keeps the mounted project workspace persistent while still letting the image supply the initial agent profile and template files.

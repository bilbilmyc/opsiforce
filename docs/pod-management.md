# Pod Management

How project pods are named, claimed, watched for failures, and replaced. Kubernetes is the single source of truth for everything pod-related; the backend treats local state as a cache that gets verified against the cluster on any sign of trouble.

---

## Authority model

The backend used to keep a `pods` table that mirrored Kubernetes pod state. That created a dual-writer problem: whenever the database and the cluster disagreed (pod evicted, network blip, crashed backend mid-write), projects could get stuck "starting" forever.

Now the cluster is authoritative:

- **Pod existence and identity** — looked up by deterministic name (`opsiforce-agent-{projectId.slice(0,8)}`)
- **Pod readiness, IP, failure reasons** — read from `pod.status` and `pod.status.containerStatuses[*].state.waiting.reason`
- **"When did we last try"** — read from `pod.metadata.creationTimestamp`

`projects.pod_ip` is kept as a fast-path cache, but it's never trusted as the source of truth. Every divergence (proxy 5xx, missing pod, IP mismatch) triggers a re-read against Kubernetes and the cache is repaired.

---

## Pod lifecycle

Every project has exactly one pod, named by its project id, with a `subPath` pointing at the project's workspace directory. The pod is created at project creation time (either via the [pending pool](./pool.md) or via the direct slow path) and recreated by name whenever it is found missing.

```
project access on suspended ─► status = starting ─► create assigned pod with subPath
                                                  ─► wait for Ready + podIP
                                                  ─► status = active

active + both TTL keys expire ─► (timeout listener) conditional UPDATE to suspended
                                  if status is still 'active' ─► delete pod ─► done

active + pod deleted externally ─► next access ─► sees pod missing in K8s
                                              ─► status = starting
                                              ─► new pod is created
```

---

## Naming

Pod names are deterministic: `opsiforce-agent-{projectId[:8]}` — pure function of the project id.

Determinism is the basis for both `createAssignedPod` idempotency (Kubernetes 409 `AlreadyExists` is treated as success — the pod already exists, proceed) and on-demand reconciliation (any backend can look up a project's pod by id).

The same scheme applies to pending pool projects: they have a project id from the moment the row is inserted, so their pod name is determined identically.

---

## Pending pool

The user-facing "new project" latency is amortized by the [pending project pool](./pool.md). A configurable number of pre-baked projects sit in `status='pending'` per agent. Claim is a fast DB flip plus a single Bifrost team customer-id PATCH (~100–500ms), versus 30–60s for the direct slow path.

The previous warm pod pool (image-cached pods labeled `opsiforce.io/pool=warm`) has been removed. On the first boot of the new code, a one-shot sweep deletes any leftover `opsiforce.io/pool=warm` pods from the cluster.

### Orphan cleanup

On backend boot, agent pods whose `opsiforce.io/project-id` label no longer matches a project row in `starting`, `active`, `pending`, or `claiming` status are deleted. Operators can clean manually if needed:

```
kubectl delete pods -l app=opsiforce-agent --field-selector status.phase=Failed
```

---

## Labels

| Label | Value | Purpose |
|-------|-------|---------|
| `app` | `opsiforce-agent` | Identifies all agent pods |
| `opsiforce.io/project-id` | `{projectId}` | Linked project for assigned pods |

---

## Readiness

```yaml
readinessProbe:
  httpGet:
    path: /global/health
    port: 4096
  initialDelaySeconds: 5
  periodSeconds: 5
```

During project startup the backend waits on informer events for two conditions, with direct polling as a fallback when the informer is unavailable:

- `pod.status.conditions[?(@.type == "Ready")].status == "True"`
- `pod.status.podIP` is set

If `containerStatuses[*].state.waiting.reason` is `ImagePullBackOff` or `ErrImagePull`, the wait fails fast — recreating the pod will not help; the image is broken.

`CrashLoopBackOff` is handled differently: on the next project access, a pod that has been in CrashLoopBackOff for more than 60 seconds is deleted so the startup flow creates a fresh one. This catches transient init failures while avoiding tight recreate loops.

---

## Status mapping

Project status (`starting`, `active`, `suspended`, `disabled`, `failed`, `pending`, `claiming`) is derived from the project row plus the K8s pod state. `pending` and `claiming` are pool-only states; see [Pending Project Pools](./pool.md):

| Project status | Pod state in K8s | Behavior on next access |
|---|---|---|
| disabled | (any) | reject immediately; admin must `enable` |
| active | pod Ready + podIP cached | fast path: return cached IP |
| active | cache miss or pod missing | re-read K8s, repair cache, or restart |
| starting | pod Ready + podIP | conditional UPDATE → active, return ready |
| starting | pod exists, not Ready | return 503; let it cook |
| starting | pod missing | spawn startup worker, return 503 |
| starting | pod CrashLoopBackOff (>60s old) | delete pod, spawn startup worker |
| starting | pod ImagePullBackOff | mark failed; show retry action |
| failed | (any) | wait for explicit retry/restart |
| suspended | (no pod expected) | atomic UPDATE → starting, spawn startup worker |

Status writes use `UPDATE … WHERE status = '<expected>'` patterns so concurrent transitions never stomp each other.

---

## Restart policy

`restartPolicy: Always`

If the agent container crashes inside an existing pod, Kubernetes restarts the container in place. If the pod itself disappears, the next user request triggers `createAssignedPod` again — same deterministic name, same subPath, same workspace.

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

Local development uses minikube with `hostPath` mounted from the host. Cluster deployments use CephFS.

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
| `/opt/agents/{AGENT_NAME}/skills/` | `/workspace/.opencode/skills/` |
| `/opt/agents/{AGENT_NAME}/template/` | `/workspace/` when `/workspace/app` does not exist |

Agent config and skills are platform-owned and refreshed on assigned pod creation. The app template is project-owned after creation, so existing apps keep their files unless an explicit migration changes them.

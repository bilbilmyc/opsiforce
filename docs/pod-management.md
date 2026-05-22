# Pod Management

How project pods are named, claimed, watched for failures, and replaced. Kubernetes is the single source of truth for everything pod-related; the backend treats local state as a cache that gets verified against the cluster on any sign of trouble.

---

## Authority model

The backend used to keep a `pods` table that mirrored Kubernetes pod state. That created a dual-writer problem: whenever the database and the cluster disagreed (pod evicted, network blip, crashed backend mid-write), projects could get stuck "starting" forever.

Now the cluster is authoritative:

- **Pod existence and identity** — looked up by deterministic name (`opsiforce-agent-{projectId.slice(0,8)}`)
- **Pod readiness, IP, failure reasons** — read from `pod.status` and `pod.status.containerStatuses[*].state.waiting.reason`
- **Warm pool membership** — encoded in pod labels (`opsiforce.io/pool=warm`)
- **"When did we last try"** — read from `pod.metadata.creationTimestamp`
- **Atomic warm-pod claim** — `deleteNamespacedPod` with a `resourceVersion` precondition

`projects.pod_ip` is kept as a fast-path cache, but it's never trusted as the source of truth. Every divergence (proxy 5xx, missing pod, IP mismatch) triggers a re-read against Kubernetes and the cache is repaired.

---

## Pod lifecycle

Warm pods are pre-created (no project subPath). When a project needs one, the warm pod is claimed by deletion and replaced by a fresh assigned pod with the project's subPath. Volume mounts are immutable after pod creation, so the warm pod cannot be re-purposed in place.

```
project access on suspended ─► status = starting ─► claim warm pod (delete with
                                                     resourceVersion precondition)
                                                  ─► create assigned pod with subPath
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

Pod names are deterministic:

- Warm pods: `opsiforce-agent-{uuid[:8]}` (UUID generated when the warm pod is created)
- Assigned pods: `opsiforce-agent-{projectId[:8]}` — pure function of the project id

Determinism is the basis for both `createAssignedPod` idempotency (Kubernetes 409 `AlreadyExists` is treated as success — the pod already exists, proceed) and on-demand reconciliation (any backend can look up a project's pod by id).

---

## Warm pool

`WARM_POOL_SIZE` warm pods are kept available at all times. The pool is queried via:

```
listPods(labelSelector = "app=opsiforce-agent,opsiforce.io/pool=warm")
```

Replenishment fires:

- on backend startup
- after a warm pod is claimed (during project startup)
- after a project pod is suspended or its project is deleted

During replenish, stuck warm pods are recycled: a warm pod older than 5 minutes that is not Ready, or any warm pod in `ImagePullBackOff`, is deleted. The pool is then topped up to `WARM_POOL_SIZE`.

### Claiming

```
1. listPods(labelSelector) returns current warm pods
2. Filter to pods that are Ready and not already being deleted
3. Sort by creationTimestamp (oldest first)
4. For each candidate:
     deleteNamespacedPod(name, preconditions: { resourceVersion })
   - 200 OK: we own the slot; proceed to create the assigned pod
   - 409 Conflict: another backend got it first; try the next candidate
   - 404 Not Found: pod was already deleted; try the next candidate
5. Replenish runs in the background to refill the pool
```

The `resourceVersion` precondition is Kubernetes' compare-and-set primitive. It replaces `FOR UPDATE SKIP LOCKED` from the previous DB-based design.

If no warm pod is claimable, project startup creates the assigned pod directly. Slightly slower; functionally equivalent.

### Orphan cleanup

On backend boot, assigned pods whose `opsiforce.io/project-id` label no longer matches a project row are deleted. Operators can still clean manually if needed:

```
kubectl delete pods -l app=opsiforce-agent,opsiforce.io/pool=assigned --field-selector status.phase=Failed
```

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

Project status (`starting`, `active`, `suspended`, `disabled`, `failed`) is derived from the project row plus the K8s pod state:

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

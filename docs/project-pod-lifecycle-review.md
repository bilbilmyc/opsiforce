# Project ↔ Pod Lifecycle Review

Why the project-to-pod orchestration was rewritten, what failure modes the new design eliminates, and what trade-offs were accepted.

For a visual reference of the same flows (happy paths, error paths, races, the state machine), see [Lifecycle Flows](lifecycle-flows.md).

---

## The bug we kept hitting

Projects would get stuck with `status = starting` and never recover. The pod was gone or broken in Kubernetes, but the backend never realised it needed to try again. Customers saw an indefinite spinner; operators had to manually restart projects or the backend.

Diagnosing the symptom revealed it wasn't one bug — it was a class of bugs sharing a structural cause.

---

## Structural cause: dual-writer state

The old architecture kept a `pods` table in Postgres that mirrored Kubernetes pod state:

```
projects.pod_name        ─► mirrors  ─► pod.metadata.name
projects.pod_ip          ─► mirrors  ─► pod.status.podIP
pods.status              ─► mirrors  ─► pod.metadata.labels + status.phase
pods.project_id          ─► mirrors  ─► pod.metadata.labels["opsiforce.io/project-id"]
```

Both stores were treated as authoritative depending on the code path. When they disagreed — pod evicted externally, network blip mid-write, backend crashed between two database statements, two replicas race-creating the same warm pod — the system could end up in inconsistent states with no automatic path back to convergence.

Concrete failure modes we observed:

- `startupTasks` in-memory map leaks a stale entry → every subsequent ensureProjectAccess thinks a startup is already running → 503 forever
- `pg_try_advisory_lock` held by a crashed backend connection → lock survives until TCP keepalive times out → minutes of "blocked startups"
- Timeout listener calls `suspendProject` while a concurrent startup is mid-`waitForReady` → status flaps, pod gets deleted under the startup worker, error gets coerced to `suspended`
- Warm pod claim deletes the database row inside a transaction, K8s delete fails silently outside it → row gone, K8s pod alive, orphan accumulates until next boot
- `setProjectActive` writes status before `ensureAssignedPodRow` → if the second write fails, project is `active` but `pods` says nothing exists → reconciler doesn't know what to do
- `waitForReady` swallows all K8s API errors silently → operator sees "not ready after 180s" with no signal that the API was unavailable for the entire wait

Each individual bug was fixable. But every fix added more reconciliation code, more "check if X agrees with Y" branches, and more places for the next code path to forget the convention. The dual-writer pattern is the cause; eliminating it is the fix.

---

## New design: Kubernetes is authoritative

Pod state lives in Kubernetes. The backend reads it on demand and caches sparingly.

| Concern | Old | New |
|---|---|---|
| Pod existence | `pods` table row | `kubectl get pod opsiforce-agent-{id[:8]}` |
| Pod IP | `pods.pod_ip` and `projects.pod_ip` (both writes, possible drift) | K8s `pod.status.podIP`; `projects.pod_ip` is a cache verified on proxy failure |
| Pod name | `projects.pod_name` (stored at create time) | Derived as `opsiforce-agent-{projectId.slice(0,8)}`; never persisted |
| Warm pool membership | `pods.status = 'warm'` rows | K8s label `opsiforce.io/pool=warm` |
| Atomic warm claim | `FOR UPDATE SKIP LOCKED` on `pods` | `deleteNamespacedPod` with `resourceVersion` precondition (compare-and-set) |
| Pod failure reason | (not tracked) | K8s `pod.status.containerStatuses[*].state.waiting.reason` |
| "When did we last try" | (not tracked) | K8s `pod.metadata.creationTimestamp` |
| In-flight startup dedup | In-memory `startupTasks` map + `pg_try_advisory_lock` | Local `startupTasks` only reduces duplicate work; deterministic pod name + K8s 409 + conditional UPDATE provide correctness |

The `pods` table is dropped. The `projects.pod_name` column is dropped. The `pod_status` enum is dropped. Net schema delta: one table, one column, one enum removed; zero new columns added.

---

## Failure modes after the rewrite

The dual-writer pattern is gone, so the entire class of "DB says X, K8s says Y" bugs cannot recur. The specific failures map as follows:

| Failure mode | Resolution |
|---|---|
| Local `startupTasks` map leaks → stuck starting | Map entries are tied to promise completion and are not authoritative. `status = 'starting'` means "this project should have a pod, check K8s and act"; every access can self-heal. |
| Advisory lock held by crashed backend | Lock removed entirely. K8s 409 handles concurrent creates; conditional UPDATEs handle status flips. |
| Timeout listener stomps in-flight startup | `UPDATE projects SET status = 'suspended' WHERE status = 'active'` affects 0 rows if a startup raced. The listener exits without touching K8s. |
| Orphan K8s pod after failed DB insert | No DB insert exists for warm pods. The label is the registration. |
| `setProjectActive` fails after pod is Ready | No multi-step `setProjectActive` — a single conditional UPDATE transitions status, pod_ip, and lastActiveAt together. |
| Stale `pod_ip` in DB | A synced informer verifies the active fast path without extra K8s API calls. Proxy 5xx still triggers a direct K8s read and either repairs the cache or restarts the pod. |
| `waitForReady` swallows K8s errors | Fast-fails on `ImagePullBackOff`/`ErrImagePull` via `PodStartupFailedError`. Other errors still retry through the next user access. |

A backend that crashes mid-startup leaves a project at `status = starting` with no pod (or a partially-created pod). The next user access reads K8s, sees no pod (or a not-ready pod), and either spawns a new startup worker or waits for the existing pod. No special recovery state machine; the on-demand flow does the work.

---

## Trade-offs we accepted

The simplification has costs. We picked them deliberately.

**Bounded retry pressure.** Transient startup failures stay in `starting` and retry with exponential backoff. Permanent image-pull failures move to `failed` so users see a retry action instead of an endless spinner.

**Assigned orphan cleanup is boot-time.** Backend startup deletes assigned pods whose `opsiforce.io/project-id` label no longer has a project row. Warm pods are managed separately by the warm-pool replenisher.

**Startup reconciliation is worker-based.** Projects in `starting` are resumed on backend boot and also reconciled on access. UI snapshots can still lag for a few seconds while workers recreate or observe pods.

**Slightly more K8s API calls during pod startup.** Each access to a project in `starting` triggers one `readNamespacedPod`. The Go proxy's 1-second TTL cache bounds this; at typical traffic we estimate ~10 extra K8s calls per startup wait. Well within K8s API server limits.

**Assumes K8s is reliable.** The system does not engineer around K8s API outages. If the K8s API is down, project ensure calls return 5xx and the frontend retries when service is restored. This matches operational reality: K8s API outages are rare, recover on their own, and are not the failure mode customers complain about.

---

## What did not change

- Storage layout (CephFS / hostPath, `subPath` per project)
- Storage and timeout semantics for existing statuses (`starting`, `active`, `suspended`, `disabled`)
- Timeout system (Redis keyspace notifications driving suspend after both TTL keys expire)
- Go runtime proxies (no changes; they consume the same backend `/ensure` contract)
- Frontend SSE contract
- All non-pod-related tables (`project_settings`, `project_apps`, `project_agent_updates`, `agents`, `tenants`, `workspaces`, defaults tables, virtual keys, schedules, etc.)

---

## Where to look in code

| File | Role |
|---|---|
| `backend/src/pod/pod.service.ts` | K8s client wrapper. Owns `assignedPodName`, `createWarmPod`, `createAssignedPod`, `waitForReady` (with ImagePullBackOff fast-fail), `deletePodIfMatches` (resourceVersion-conditional delete), `inspectFailureReason`. |
| `backend/src/pod/pod.pool.service.ts` | Warm pool. Lists pods by label, atomic claim via conditional delete, replenishment with stuck-pod recycling. No DB touches. |
| `backend/src/project/project.service.ts` | The lifecycle brain. `ensureProjectAccess` is the entry point: status-driven dispatch into `wakeSuspendedProject`, `handleStartingProject`, `verifyActiveProject`. `runStartup` performs the warm-claim/create-pod/wait-for-ready cycle. All status writes use conditional UPDATEs. |
| `backend/src/timeout/timeout.listener.ts` | Suspends `active` projects via conditional UPDATE; bails if a startup raced. |
| `backend/src/proxy/proxy.service.ts` | Uses `projects.pod_ip` cache for upstream resolution. Exposes `getAssignedPodName` for the proxy controller's response. |
| `backend/db/migrations/0030_drop-pods-table-k8s-authority.sql` | The schema delta. |

---

## What we'd want next

This rewrite addresses the "stuck starting" symptom and its structural cause. Adjacent work that could come next, but isn't part of this change:

- **Longer assigned pod names.** `projectId.slice(0, 8)` is fine for current scale, but full UUID pod names would remove birthday-collision risk before very large project counts.
- **Per-tenant warm pools.** Trivial to add — just put a tenant id in the label selector. Not part of current product requirements.
- **Failure observability.** Surface `pod.status.containerStatuses[*].state.waiting.reason` in a `/admin/projects/{id}/pod` endpoint for operators. Not in scope here; the data is already available via `kubectl describe pod`.

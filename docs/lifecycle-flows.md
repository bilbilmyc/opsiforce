# Lifecycle Flows

Visual reference for the project-to-pod lifecycle: which layer is involved at each step, how happy paths route, how error paths recover, and how concurrent operations are made safe. Companion to [Project Pod Lifecycle Review](project-pod-lifecycle-review.md) which explains *why* the design is shaped this way.

---

## Conclusions at a glance

1. **Kubernetes is the single source of truth** for pod existence, IP, readiness, and failure reasons. The backend keeps `projects.pod_ip` as a cache that is verified on any error.
2. **Every request is a self-healing reconciliation**. `ensureProjectAccess` dispatches on project status and repairs divergence between the cache and the cluster on the spot — there is no separate reconciler.
3. **Two concurrency primitives, both fail-safe**: deterministic pod names + K8s 409 `AlreadyExists` for pod creation, and `UPDATE projects ... WHERE status = 'X'` for DB transitions. Per-process startup dedupe prevents duplicate local workers.
4. **Four caches absorb the load**: the Go runtime proxy caches "ready" responses 5s and "starting" responses 1s, the backend informer caches K8s pod state, and `projects.pod_ip` is cached until proven stale.
5. **Permanent startup failures are explicit**. ImagePullBackOff moves the project to `failed` with a retry action; transient failures retry with exponential backoff; CrashLoopBackOff is given 60s before forced pod replacement.

---

## Architecture stack

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser (Solid.js frontend)                                         │
│   • SSE stream: GET /api/projects/:id/events                         │
│   • Renders status: starting | active | suspended | disabled | failed│
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Edge layer (nginx local / public edge proxy + OAuth2 Proxy)         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Go runtime proxy  (per-surface: agent / app / vscode / db)          │
│                                                                      │
│   In-process cache:                                                  │
│     • "ready"    responses cached 5s                                 │
│     • "starting" responses cached 1s                                 │
│     • in-flight dedup (1 backend call per cache key)                 │
│                                                                      │
│   On upstream 5xx: invalidates own cache, POSTs /failure to backend  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ POST /internal/proxy/projects/:id/ensure
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Backend (NestJS / Fastify)                                          │
│                                                                      │
│   ProxyController.ensureProject                                      │
│         │                                                            │
│         ▼                                                            │
│   ProjectService.ensureProjectAccess        ◄── status dispatcher    │
│     ├─ disabled    → return disabled                                 │
│     ├─ suspended   → wakeSuspendedProject                            │
│     ├─ starting    → handleStartingProject                           │
│     └─ active      → fast path (podIp cached) | verifyActiveProject  │
│         │                                                            │
│         ▼                                                            │
│   PodService          PodPoolService       TimeoutListener           │
│   • getPod            • claimWarmPod       • Redis subscriber        │
│   • createAssigned    • replenish          • Conditional suspend     │
│   • waitForReady      • deletePod                                    │
│   • inspectFailure                                                   │
└──────┬───────────────────────┬───────────────────────────┬───────────┘
       │                       │                           │
       ▼                       ▼                           ▼
┌─────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ PostgreSQL  │       │ Kubernetes API   │       │ Redis (Valkey)   │
│             │       │                  │       │                  │
│ projects:   │       │ Pods labeled:    │       │ TTL keys:        │
│   status    │       │  app=agent       │       │  opsiforce:      │
│   pod_ip    │       │  pool=warm|      │       │   timeout:{id}   │
│   ...       │       │       assigned   │       │   app-timeout:{} │
│             │       │  project-id=...  │       │                  │
│ (no pods    │       │ status:          │       │ Pub/sub:         │
│  table)     │       │  conditions      │       │  __keyevent__:   │
│             │       │  podIP           │       │   :expired       │
│             │       │  containerStatus │       │                  │
└─────────────┘       └──────────────────┘       └──────────────────┘
       ▲                       ▲                           │
       └───────────────────────┴───────────────────────────┘
              cache is verified on error / divergence
              K8s wins disagreements
```

---

## Happy path: request to active project (Go-proxy cache hit)

```
[Browser] ─POST /api/proxy/p1/session/.../message─▶
          │
          ▼
[Edge nginx]
          │
          ▼
[Go agent proxy]
   cache.GetOrLoad("p1|agent|<authsig>") ──▶ HIT (within 5s TTL)
          │
   Forward to cached upstream  http://10.244.1.42:4096
          │
          ▼
[Pod opsiforce-agent-12345678]
   OpenCode handles, streams response
          │
          ▼
[Browser]

   K8s API calls:  0
   DB queries:     0
   Layers touched: Browser → Edge → Go proxy → Pod
```

---

## Happy path: Go-proxy cache miss, backend fast path

```
[Browser] ─▶ [Edge] ─▶ [Go proxy: cache MISS]
                       │
                       ▼  POST /internal/proxy/projects/p1/ensure
                  [ProxyController]
                       │
                       ▼
                  [ProjectService.ensureProjectAccess]
                     status === 'active'
                     project.pod_ip is set  ──▶ YES
                       │
                       ▼
                  return { state: "ready", podIp, podName (derived) }
                       │
                       ▼  (Go proxy caches this for 5s)
                  [Go proxy]
                       │
                       ▼  routes to podIp
                  [Pod]

   K8s API calls:  0
   DB queries:     1 (SELECT project)
   Layers touched: Browser → Edge → Go proxy → Backend → DB → Pod
```

---

## Happy path: wake suspended project (cold start)

```
Project p1: status=suspended (pod gone, workspace persisted on shared storage)

[Browser opens p1] ──▶ [Edge] ──▶ [Go proxy: MISS] ──▶ POST /ensure
                                                              │
                                                              ▼
                                        [ProjectService.ensureProjectAccess]
                                                  status === 'suspended'
                                                              │
                                                              ▼
                                            [wakeSuspendedProject]
                                                              │
                                              UPDATE projects
                                                SET status='starting', pod_ip=NULL
                                                WHERE id=p1 AND status='suspended'
                                              ──▶ 1 row updated
                                                              │
                                          ┌───────────────────┼──────────────────┐
                                          ▼                   ▼                  ▼
                            projectEvents.publish      spawnStartupWorker     return
                                  SSE event:           (async, no await)      { state:
                                  {status: starting}                            "starting" }
                                                              │
                                                              ▼ async worker:
                                                       [runStartup(p1)]
                                                              │
                                              [PodPoolService.claimWarmPod]
                                                  listPods(label pool=warm)
                                                  pick oldest Ready candidate
                                                  deletePodIfMatches(name, resourceVersion)
                                                    ──▶ 200 OK = claimed
                                                    ──▶ 409 = race lost, try next
                                                              │
                                                              ▼
                                              [PodService.createAssignedPod(p1)]
                                                  createNamespacedPod("opsiforce-agent-12345678")
                                                    ──▶ 201 = ours
                                                    ──▶ 409 AlreadyExists = converge, ok
                                                              │
                                                              ▼
	                                              [PodService.waitForReady]
	                                                  wait on informer events
	                                                  poll if informer unavailable
	                                                  check pod.status.conditions[Ready] + podIP
	                                                  fast-fail on ImagePullBackOff
                                                              │
                                                              ▼
                                              UPDATE projects
                                                SET status='active', pod_ip=$ip
                                                WHERE id=p1 AND status='starting'
                                              projectEvents.publish ──▶ SSE: {active}

[Browser] ──▶ SSE receives "active" ──▶ retries original request ──▶ hits fast path

   K8s API calls: 1 list + 1 patch (claim) + 1 create; readiness uses informer events when synced
   DB queries:    4 conditional UPDATEs
   Layers touched: every layer in the stack
```

---

## Error path: ImagePullBackOff (broken image)

```
Project p1: status=starting; assigned pod is in ImagePullBackOff loop

[Browser opens p1] ──▶ [Go proxy: MISS] ──▶ POST /ensure
                                                  │
                                                  ▼
                                  [handleStartingProject]
                                  pod = getPod("opsiforce-agent-12345678")
                                  pod exists, not Ready
                                  inspectFailureReason(pod) ──▶ "ImagePullBackOff"
                                                  │
                                                  ▼
                                  mark project failed
                                  keep pod for inspection
                                                  │
                                                  ▼
                                  return { state: "failed" }
                                                  │
                                                  ▼ Browser
                                  [Browser shows failed state + Retry]

Meanwhile the async startup worker that triggered the create:

   [runStartup worker]
   waitForReady receives an update:
     containerStatuses[].state.waiting.reason = "ImagePullBackOff"
     throws PodStartupFailedError("ImagePullBackOff")
                  │
                  ▼
   [handleStartupFailure]
     isPermanentImageFailure = true
     SKIP pod delete (would just recreate with same bad image)
     log "Startup failed for p1: ImagePullBackOff"
    status = 'failed'

Recovery:
  • Ops fixes the image/deployment
  • User clicks Retry or admin restarts the project
  • Startup returns to starting, then active when Ready

   No retry storm. The user sees a terminal failed state until retry.
```

---

## Error path: CrashLoopBackOff

```
Project p1: status=starting; container crashes immediately on every start

First user access (pod just created, age 10s):
  [handleStartingProject]
    pod = getPod(...)
    pod exists, not Ready
    inspectFailureReason ──▶ "CrashLoopBackOff"
    ageMs = 10_000 < CRASH_LOOP_RECREATE_AGE_MS (60_000)
              │
              ▼
    Give K8s' restartPolicy: Always a chance to recover transient failure
    return { state: "starting" }

(Pod keeps crashing; K8s restart-policy gives up; backoff grows)

Later access (pod age >60s):
  [handleStartingProject]
    pod still in CrashLoopBackOff, ageMs > 60_000
              │
              ▼
    podService.deletePod("opsiforce-agent-12345678")  // force fresh start
    spawnStartupWorker(p1)
              │
              ▼ (worker creates NEW pod, same name, fresh container)
    return { state: "starting" }

   If new pod also crashes: 60s timer restarts. Same loop until container is fixed.
   No counter, no "give up" — admin disables if unrecoverable.
```

---

## Error path: external pod deletion

```
Project p1: status=active, pod_ip=10.244.1.42 cached, working fine.
Ops runs: kubectl delete pod opsiforce-agent-12345678

[Browser sends request]
       │
       ▼
[Go proxy: cache HIT "ready"] ──▶ routes to 10.244.1.42:4096
       │
       ▼
   Connection refused (no pod)
       │
       ▼
[Go proxy: invalidate own cache for p1]
       │  POST /internal/proxy/projects/p1/failure
       ▼
[Backend.handleProxyFailureForProject]
    status === 'active'
    podName = assignedPodName(p1)
    pod = getPod(podName) ──▶ null (404)
       │
       ▼
    [requestProjectStartup({ deleteExistingPod: false })]
       UPDATE projects
         SET status='starting', pod_ip=NULL
         WHERE status IN ('active', 'suspended')
       ──▶ 1 row updated
       spawnStartupWorker(p1)
       projectEvents.publish ──▶ SSE: {starting}
       │
       ▼
    return { restart: true }
       │
       ▼ Go proxy: 503 → Browser

[Browser SSE receives "starting", shows spinner]
[Worker creates pod with same deterministic name + same subPath]
[Workspace files preserved on shared storage]
[Pod becomes Ready, status flips to active]
[Browser retries on SSE update → hits new pod]

   Same code path handles: pod evicted by K8s, node drained, OOMKilled,
                           manual kubectl delete, scale-to-zero.
```

---

## Race: timeout listener vs in-flight startup

```
Time T0:   Project p1 status=active, idle. Redis TTL key has 30s remaining.
Time T30s: TTL expires. Keyspace event fires.
Time T30s+ε: User accesses project (touches TTL, but event already fired).

Two concurrent paths race for the projects row:

      [TimeoutListener]                      [ensureProjectAccess]
            │                                          │
            ▼                                          ▼
      isFullyExpired? yes              status=active, pod_ip=cached
      suspendProject(p1)               return { state: "ready" }
            │                                          │
            │   (parallel)                  [Browser uses ready response]
            ▼                                          │
      UPDATE projects                                  │
        SET status='suspended',                        │
            pod_ip=NULL                                │
        WHERE id=p1                                    │
          AND status='active'                          │
                                                       │
   ──▶ 1 row updated:                                  │
       Listener wins; deletes pod                      │
       Next browser request sees                       │
       status=suspended, woken normally                │
                                                       │
   ──▶ 0 rows updated:                                 │
       Startup raced ahead (somewhere) and             │
       moved status to 'starting'.                     │
       Listener BAILS — no K8s touch, no harm.        │

Conditional UPDATE is the only coordination needed.
No advisory lock, no Map. Postgres row lock serializes the two writes.
Whichever transaction commits first wins; the other observes the new state.
```

---

## Race: backend crashed mid-startup

```
Time T0:  Backend B1 spawns startup worker for project p1
Time T1:  Worker calls createAssignedPod (succeeds, pod is Pending)
Time T2:  Worker calls waitForReady
Time T3:  Backend B1 CRASHES (OOM, kubectl rollout, etc.)
          • DB state: projects.status = 'starting', pod_ip = NULL
          • K8s state: pod exists, becoming Ready
          • No startup worker watching anymore

Time T4:  Backend B2 starts (no boot sweep — drop is intentional)
          • Does nothing. Waits for traffic.

Time T5:  User opens p1
          [Browser] ──▶ [Go proxy] ──▶ POST /ensure
                                              │
                                              ▼
                              [handleStartingProject]
                              pod = getPod("opsiforce-agent-12345678")
                              pod EXISTS (B1 created it before crashing)
                              isPodReady(pod) = true
                              podIp = "10.244.1.99"
                                              │
                                              ▼
                              UPDATE projects
                                SET status='active', pod_ip='10.244.1.99'
                                WHERE id=p1 AND status='starting'
                              ──▶ 1 row updated
                                              │
                                              ▼
                              return { state: "ready", podIp }

   The crashed worker's work is automatically picked up by the next request.
   No special "recovery" code path. The dispatcher's status-starting branch IS the recovery.

ALTERNATE: B1 crashed BEFORE creating the pod
  [handleStartingProject]
    pod = getPod(...) ──▶ null
              │
              ▼
    spawnStartupWorker(p1)   // fresh attempt
    return { state: "starting" }

   Either way: lazy on-demand reconciliation. No timer, no boot sweep, no lease.
```

---

## Project status state machine

```
                       ┌───────────────────────────────────────────┐
                       │                disabled                   │
                       │  admin-set; auto-wake blocked             │
                       │  must call enable() to leave              │
                       └───────────────────────────────────────────┘
                            ▲                ▲
                            │                │
              admin disable │                │ admin enable
              (from any)    │                │
                            │                ▼
   ┌───────────────────────┐    ┌────────────────────────────────────┐
   │       suspended       │    │              starting              │
   │ no pod; workspace     │◄───│ pod should exist; check K8s         │◄──┐
   │ preserved on disk     │    │                                    │   │
   │                       │    │ on access:                         │   │
   │ on access:            │    │  pod Ready+IP   → active           │   │
   │  UPDATE ... WHERE     │    │  pod Pending    → 503, wait        │   │
   │   status=suspended    │───▶│  pod CrashLoop  → delete if >60s   │   │
   │  → starting           │    │  pod ImagePull  → failed           │   │
   │                       │    │  pod missing    → spawn worker     │   │
   └───────────────────────┘    └────────────────────────────────────┘   │
              ▲                            │           ▲                  │
              │                            │           │                  │
       both TTLs expire                    │   pod deleted externally,   │
       AND status='active'                 │   handleProxyFailure        │
       (conditional UPDATE                 │   detects → set starting     │
        protects in-flight                 │                              │
        startup)                           │ pod Ready + IP detected      │
              │                            ▼ (conditional UPDATE          │
              │            ┌────────────────────────────────────┐         │
              │            │              active                │         │
              └────────────│ pod Ready, pod_ip cached           │         │
                           │ serving traffic                    │         │
                           │                                    │         │
                           │ on access:                         │         │
                           │  pod_ip cached → fast path         │         │
                           │  pod_ip null   → verify K8s, repair│         │
                           │ on proxy 5xx:                      │         │
                           │  K8s pod missing → starting────────┼─────────┘
                           └────────────────────────────────────┘

   Every transition is a conditional UPDATE: WHERE status = '<expected prev>'.
   That predicate is the only concurrency primitive at the DB layer.
   K8s 409 AlreadyExists is the equivalent primitive at the K8s layer.
```

---

## Performance characteristics

| Path | K8s calls / req | DB queries / req | Latency |
|---|---|---|---|
| Active + Go-proxy cache hit | 0 | 0 | ~pod-processing only |
| Active + Go-proxy cache miss + DB fast path | 0 API calls; 1 informer lookup when synced | 1 | ~2-5ms |
| Active + cache miss + DB pod_ip null | 0 API calls when informer synced; 1 fallback read otherwise | 1-3 | ~2-40ms |
| Starting (on-demand K8s check) | 0 API calls when informer synced; 1 fallback read otherwise | 0-1 | ~2-40ms |
| Suspended → starting transition | 1 list + 1 create + informer wait; polling fallback if informer unavailable | 3-4 conditional UPDATEs | 503 returned immediately; pod ready ~10-30s later |

At 100 req/s steady state across 50 active projects: effectively zero K8s API calls when the informer is synced. The backend does memory lookups, not API reads.

---

## Where to look in code

| File | Role |
|---|---|
| `backend/src/pod/pod.service.ts` | K8s client wrapper. `assignedPodName`, `createAssignedPod`, `waitForReady` (ImagePullBackOff fast-fail), `deletePodIfMatches`, `inspectFailureReason`. |
| `backend/src/pod/pod.pool.service.ts` | Warm pool. `claimWarmPod` via label-list + conditional delete; `replenish` recycles stuck pods. No DB writes. |
| `backend/src/project/project.service.ts` | `ensureProjectAccess` dispatcher + the four branch handlers (`wakeSuspendedProject`, `handleStartingProject`, `verifyActiveProject`, fast path). `runStartup` worker. |
| `backend/src/timeout/timeout.listener.ts` | Conditional `UPDATE ... WHERE status='active'` suspend. Bails if a startup raced. |
| `backend/src/proxy/proxy.service.ts` | `projects.pod_ip` cache → upstream URL. `getAssignedPodName` for response payload. |
| `backend/src/proxy/proxy.controller.ts` | The `/internal/proxy/projects/:id/ensure` and `/failure` endpoints. |

---

## Related docs

- [Project Pod Lifecycle Review](project-pod-lifecycle-review.md) — narrative on *why* the design was reshaped (the dual-writer story and the failure modes it caused).
- [Pod Management](pod-management.md) — warm pool details, labeling conventions, readiness probe.
- [Request Flows](request-flows.md) — step-by-step flows for new project, duplicate, chat, app preview, deletion.
- [Persistence](persistence.md) — what survives pod replacement; storage backends; tombstones.

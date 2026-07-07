# Project Pod Lifecycle

> Why pod orchestration treats Kubernetes as the single source of truth, and how a pod is created, recovered, and suspended. Read this to understand the pod state model before changing anything in `pod/`, `project/`, or `timeout/`.

The running unit is the **ProjectEnvironment**, not the Project. Each ProjectEnvironment owns its own pod, status, and cached pod IP (`project_environments.status` / `pod_ip` / `directory`); a Project is a shell that groups them (see [Project Environments](../projects/environments.md) and [ADR-0001](../adr/0001-environment-vs-project-environment.md)). Throughout this doc, "the environment" is the thing that has a pod.

## The bug this design eliminates

Environments used to get stuck in `starting` forever: the pod was gone or broken in Kubernetes, but the backend never noticed it had to try again. Customers saw an indefinite spinner; operators restarted projects or the backend by hand.

It was not one bug but a class of them, sharing a structural cause: a `pods` table in Postgres **mirrored** Kubernetes pod state (name, IP, phase). Both stores were treated as authoritative depending on the code path, so whenever they disagreed — pod evicted, network blip mid-write, backend crash between two statements, two replicas racing — the system landed in an inconsistent state with no automatic path back to convergence. Every fix added another "check if X agrees with Y" branch and another place for the next code path to forget the convention.

## Kubernetes is authoritative

The fix removes the second writer. Pod state lives in Kubernetes; the backend reads it on demand and caches sparingly.

- **Existence and identity** — looked up by a deterministic name, `opsiforce-agent-{environmentId[:8]}`. The name is a pure function of the environment id and is never persisted.
- **Readiness, IP, failure reason** — read from `pod.status` (`conditions[Ready]`, `podIP`, `containerStatuses[].state.waiting.reason`).
- **"When did we last try"** — read from `pod.metadata.creationTimestamp`.

`project_environments.pod_ip` is kept only as a fast-path routing cache. It is never trusted as truth: any divergence (proxy 5xx, missing pod, IP mismatch) triggers a re-read against Kubernetes and repairs the cache. The `pods` table, the `pod_name` column, and the `pod_status` enum were dropped ([migration `0030_drop-pods-table-k8s-authority.sql`](../../backend/db/migrations)).

Two concurrency primitives keep this correct without locks, and both fail safe:

- **Deterministic name + K8s `409 AlreadyExists`** for pod creation — two backends creating the same pod converge; the loser treats 409 as success.
- **Conditional `UPDATE … WHERE status = '<expected>'`** for every status transition — two writers can't stomp each other; the loser updates zero rows and bails. Postgres' row lock serializes them. There is no advisory lock and no in-memory map that correctness depends on (a per-process map only avoids duplicate local work).

## How a pod comes to exist

A **new project** amortizes startup latency through the [pending-project pool](pool.md): the user's "New Project" click claims a pre-baked, already-running environment in a fast atomic flip rather than waiting 30–60s for a cold pod. (The older image-cached *warm pool* is gone; only a one-time boot sweep still deletes any leftover `opsiforce.io/pool=warm` pods.)

Every other path to a pod is the same on-demand reconciliation, driven by `ProjectService.ensureEnvironment` — the status dispatcher the runtime proxies call before forwarding any request:

```
                    ┌──────────────────────────────────────────────┐
        admin       │                  disabled                    │
       disable ────▶│   project-level flag; auto-wake blocked;      │
     (project)      │   admin must re-enable                        │
                    └──────────────────────────────────────────────┘

   ┌──────────────────────┐         ┌────────────────────────────────────┐
   │      suspended        │ access  │              starting              │
   │ no pod; workspace      │───────▶│ pod should exist — check K8s:       │◀─┐
   │ preserved on disk      │        │  Ready + IP    → active             │  │
   │                        │        │  Pending       → 503, let it cook   │  │
   │ wakeSuspended-         │◀───────│  CrashLoop>60s  → delete, recreate  │  │
   │   Environment:         │        │  ImagePullBackOff → failed          │  │
   │  UPDATE … WHERE        │        │  missing        → spawn startup     │  │
   │   status=suspended     │        └────────────────────────────────────┘  │
   └──────────────────────┘                  │              ▲                │
              ▲                               │ pod Ready+IP │ proxy 5xx +    │
   both TTLs expire AND status=active         │ (conditional │ K8s pod gone   │
   (conditional UPDATE protects an            ▼  UPDATE)     │ → starting     │
    in-flight startup)        ┌────────────────────────────────────┐         │
              │               │                active               │─────────┘
              └───────────────│ pod Ready, pod_ip cached, serving    │
                              │  cache hit → fast path (no K8s call)  │
                              │  cache null → verify K8s, repair      │
                              └────────────────────────────────────┘

   Every arrow is a conditional UPDATE WHERE status='<expected prev>'.
```

`ensureEnvironment` dispatches on status into `wakeSuspendedEnvironment`, `handleStartingEnvironment`, `verifyActiveEnvironment`, and the active fast path; `runStartupWorker` performs the claim-or-create-pod / wait-for-ready cycle asynchronously and flips the status to `active` on success. Readiness waits on informer events (polling only when the informer is unavailable), checking `conditions[Ready]` + `podIP`, and fast-fails on `ImagePullBackOff`/`ErrImagePill` because recreating the pod can't fix a broken image.

## Recovery is event-driven and self-healing

There is no polling reconciler. Recovery reacts to events — a pod delete event, a backend boot, a failed request:

- **External pod deletion** (kubectl, eviction, node drain, OOMKill) — a global subscription to the pod informer's delete events resolves the environment from the deleted pod's `opsiforce.io/environment-id` label and, for an enabled `active` environment with live Keep-alive timers whose pod is confirmed gone, flips it to `starting` and spawns the normal startup worker ([ADR-0019](../adr/0019-externally-deleted-pods-recreated-eagerly.md)). The pod is back within seconds, with no user traffic. Self-inflicted deletions (suspend, restart, publish, disable) no-op structurally: every internal flow moves the row out of `active` before deleting the pod, so the watcher's conditional flip matches zero rows — no allow-list of "our own" deletions exists. The watcher is best-effort: deletions missed during an informer reconnect gap are caught by the boot sweep below or, ultimately, by the lazy path — the proxy's upstream call fails, it reports `/failure`, the backend sees the pod gone and flips the environment to `starting`. Every cause funnels into the same startup worker, and the new pod with the same deterministic name and `subPath` comes up against the persisted workspace.
- **Backend crash mid-startup** — leaves the environment `starting` with a partially-created or already-Ready pod. The next access reads K8s and either flips to `active` (pod became Ready while no worker watched) or spawns a fresh worker (pod never got created). No boot-time recovery state machine is needed.
- **Timeout listener vs. in-flight startup** — when an idle TTL expires at the same moment a user returns, both race for the row. The listener's `UPDATE … WHERE status='active'` affects zero rows if a startup already moved the row to `starting`, so it exits without touching Kubernetes.
- **CrashLoopBackOff** — given 60s (K8s `restartPolicy: Always` may recover a transient crash); past that, the pod is deleted so a fresh one is created. No "give up" counter — an operator disables the project if it's unrecoverable.
- **ImagePullBackOff** — terminal: the environment moves to `failed` with a retry action, instead of an endless spinner.

A short boot pass complements this: orphaned agent pods (whose `opsiforce.io/project-id` label has no matching row) are deleted, environments stranded in `starting` get workers resumed, and `active` environments whose pod is gone are flipped back to `starting` and recreated without waiting for traffic ([ADR-0019](../adr/0019-externally-deleted-pods-recreated-eagerly.md) — the repair for pods deleted while the backend was down; the delete-event watcher above covers deletions while it runs). Both ADR-0019 repairs are deliberately conservative: only a confirmed absence counts — an explicit K8s 404, or a pod already carrying a deletion timestamp; any other API outcome skips the environment, so a control-plane blip can never mass-flip the fleet. Recovery reads the Keep-alive timers but never refreshes them — environments past both TTLs are left to the expired-timer suspension sweep, and a recovered environment keeps its original suspension schedule.

## Suspension

Idle suspension is event-driven through Redis keyspace notifications. Each environment has two independent TTL keys — `opsiforce:timeout:{id}` (agent activity) and `opsiforce:app-timeout:{id}` (app/preview/VS Code/DB activity) — and is suspended only once **both** have expired. The listener suspends with the conditional `UPDATE … WHERE status='active'` above, deletes the pod (404 ignored), and is backstopped by a startup sweep that catches expiries missed while the backend was down. Redis must have `notify-keyspace-events Ex` enabled in its own deployment; the backend no longer sets it at runtime. The two-kind model is the same one the [Pods](pods.md) operational view renders.

## Trade-offs accepted

- **Slightly more K8s reads during startup** — each access to a `starting` environment may trigger one `readNamespacedPod`; the informer cache and the proxy's short TTL keep this near zero at steady state.
- **Recovery is event-driven, not polled** — externally deleted pods are recreated eagerly (boot sweep + delete-event watcher, [ADR-0019](../adr/0019-externally-deleted-pods-recreated-eagerly.md)), but there is no interval reconciler: a deletion missed during an informer reconnect gap waits for the next boot or the next request. Accepted because the watcher plus boot sweep cover how fleets actually fail, and a polling loop would add bounded-staleness machinery for no additional coverage.
- **Assumes K8s is reliable** — the system does not engineer around K8s API outages; ensure calls return 5xx and the frontend retries. These outages are rare and self-recovering, and not the failure mode customers hit.

## See also

- [Request Flows](request-flows.md) — how the runtime proxies and the shared `ensure` gate route a request to the pod.
- [Pending Project Pools](pool.md) — how a new project claims a pre-baked environment instead of cold-starting.
- [Pods](pods.md) — the read-only operational view of running pods and their keep-alive ([ADR-0013](../adr/0013-pods-view-reads-live-keepalive-from-redis.md)).
- [Persistence & Storage](persistence.md) — what survives pod replacement, and the `subPath` workspace layout.
- Code: `backend/src/pod/pod.service.ts` (`assignedPodName`, `createAssignedPod`, `waitForReady`, `deletePodIfMatches`, `inspectFailureReason`), `backend/src/project/project.service.ts` (`ensureEnvironment` + branch handlers + `runStartupWorker`), `backend/src/timeout/timeout.listener.ts`, `backend/src/pool/project-pool.service.ts`, `backend/src/proxy/proxy.service.ts`.

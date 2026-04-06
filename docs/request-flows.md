# Request Flows

How requests flow through the Opsiforce system for key user actions.

---

## Starting a new project

```
1. User clicks "New Project" in sidebar
2. Frontend POST /api/projects → proxy → backend
3. Backend ProjectService:
   a. Creates project record in PostgreSQL (status: pending)
   b. If Bifrost configured: creates virtual key via Bifrost Admin API, stores in project_api_keys
   c. Claims warm pod from pool (PodPoolService)
   d. Deletes warm pod, creates new pod with subPath = "projects/{project-id}"
      - If Bifrost: injects OPENAI_API_KEY=<virtual key> + OPENAI_BASE_URL=<bifrost url>
      - If no Bifrost: injects OPENAI_API_KEY=<direct key>
      - Injects dynamic skills (ai-api) into init container
   e. Waits for readiness probe (/global/health on :4096)
   f. Records pod IP in DB, sets project status to active
   g. Returns project ID to frontend
4. Frontend updates sidebar, navigates to ProjectView
5. ProjectView fetches /api/proxy/{projectId}/path for working directory
6. ProjectView fetches /api/proxy/{projectId}/session for existing sessions
7. Creates MemoryRouter with initial path /{base64(directory)}/session/{sessionId}
8. Mounts OpenCode's AppInterface connected to the agent pod via server URL
```

---

## Sending a chat message

```
1. User types in OpenCode UI (embedded in frontend)
2. OpenCode SDK → POST /api/proxy/{projectId}/session/{sid}/message
3. proxy → backend (NestJS)
4. ProxyController touches timeout (Redis SETEX opsiforce:timeout:{id} TTL 1800)
5. ProxyController resolves project → pod IP from DB
6. Backend proxies request to http://{podIp}:4096/session/{sid}/message
7. opencode serve processes message, streams SSE response back
8. Response streams through backend → proxy → frontend
```

---

## Pod timeout (Redis keyspace notifications)

Idle timeout is **event-driven, not polling-based**. Redis notifies the backend the instant a timeout key expires — zero polling, zero delay.

### The Redis key lifecycle

Every proxy request resets a 30-minute countdown:

```
SETEX opsiforce:timeout:{projectId} 1800 "{timestamp}"
       ↑ key name                    ↑ TTL (30 min)
```

If the user keeps sending requests, the TTL keeps resetting to 1800. The key only expires when there's been **no activity for a full 30 minutes**.

### How expiration detection works

Redis has a built-in feature: **keyspace notifications**. When enabled (`notify-keyspace-events Ex`), Redis publishes a message on a pub/sub channel every time a key expires:

```
Channel:  __keyevent@{db}__:expired        (db = Redis database number from REDIS_URL)
Message:  opsiforce:timeout:{projectId}    (the key that just expired)
```

`TimeoutListener` subscribes to this channel using a **dedicated Redis connection** (Redis requires a separate connection for pub/sub — a subscribed client can't run normal commands like SETEX/DEL).

### What TimeoutListener does

```
On startup:
  1. CONFIG SET notify-keyspace-events Ex    (enable notifications, idempotent)
  2. Create dedicated subscriber Redis connection
  3. SUBSCRIBE __keyevent@{db}__:expired
  4. Sweep: check all active projects' Redis TTLs, suspend any already expired
     (catches events missed while backend was down)

At runtime (event-driven):
  5. Redis key expires → message arrives on subscriber
  6. Parse key → extract projectId
  7. Load project from DB, verify status is "active"
  8. Kill K8s pod, clean up pods table
  9. Set project status to "suspended", clear podName/podIp
  10. Replenish warm pool

On Redis reconnection:
  - ioredis auto-resubscribes to the channel
  - Sweep again (catch events missed during the connection gap)
```

### Why a dedicated Redis connection?

Redis protocol rule: once a connection calls `SUBSCRIBE`, it enters **subscriber mode** and can only receive pub/sub messages. It can no longer run `SETEX`, `TTL`, `DEL`, etc. So:

- `TimeoutService.redis` — normal connection for SETEX/TTL/DEL (used by touchActivity, isExpired, clear)
- `TimeoutListener.subscriber` — pub/sub connection, only receives expiration events

### Why the startup sweep?

Redis pub/sub is fire-and-forget. If nobody is subscribed when an event fires, it's lost. Two scenarios:

1. **Backend restarts** — key expires at 14:05, backend starts at 14:06 → event lost
2. **Redis connection drops briefly** — ioredis reconnects, but events during the gap are lost

The sweep queries all active projects, checks their Redis TTLs, and suspends any that already expired. Runs once on startup and again on every reconnection.

### Timeline example

```
14:00:00  User sends a message → SETEX timeout:abc 1800   (expires at 14:30)
14:10:00  User sends a message → SETEX timeout:abc 1800   (expires at 14:40)
14:15:00  User sends a message → SETEX timeout:abc 1800   (expires at 14:45)
14:15:01  User closes laptop...

14:45:00  Redis expires key "timeout:abc"
14:45:00  Redis publishes → __keyevent@2__:expired → "opsiforce:timeout:abc"
14:45:00  TimeoutListener receives event → kills pod, suspends project (instant)

15:30:00  User opens laptop, clicks project
15:30:00  Frontend → GET /api/proxy/abc/session
15:30:00  ProxyController: project suspended, no podIp → auto-reassign
15:30:00  → Returns 503 "Pod is restarting"
15:30:10  Pod ready, project active → UI loads with full chat history
```

### Redis configuration

`notify-keyspace-events Ex` must be enabled on the Redis instance the backend connects to. Each environment configures this independently:

- **Local** (minikube): Shared Bitnami Redis — enabled via `--set 'commonConfiguration=notify-keyspace-events Ex'` in the `install-session-redis` script (`package.json`). The shared values file (`infra/k8s/session-stroage/values.yml`) stays clean of opsiforce-specific config.
- **Production** (CloudFleet): Valkey subchart in `opsiforce-proxy` — configured via `valkeyConfig` in `helm/opsiforce-proxy/values.yaml`. The backend's `REDIS_URL` is set in CI/CD to point at this Valkey instance (`redis://opsiforce-proxy-{env}-valkey:6379`).

The Valkey subchart serves both the OAuth2 Proxy (session cookies) and the opsiforce backend (timeout tracking).

---

## Auto-reassignment (pod died or project suspended)

```
When a proxy request detects a dead/missing pod:
1. ProxyController fetch to pod fails (K8s 404 or connection refused)
2. Calls ProjectService.reassignPod(projectId):
   a. Cleans up old pod from DB
   b. Sets project status to "pending"
   c. Async: claims warm pod → creates assigned pod → status becomes "active"
3. Returns 503 {"error": "Pod is restarting, please retry"}
4. Frontend retries, pod is ready in ~10s

Also handles suspended projects:
  - ProxyService.resolveUpstream() finds no podName/podIp
  - Throws ServiceUnavailableException → same reassignment flow
```

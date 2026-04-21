# Schedules

Agents can register cron-scheduled HTTP callbacks against endpoints in the apps they build. The platform fires schedules internally (intra-cluster), waking suspended pods as needed.

## Why

Agents build web apps with backend APIs. Users need recurring tasks — daily reports, periodic data syncs, health checks. Without scheduling, users must manually trigger these or set up external cron jobs that need auth bypass.

The schedule system lets the agent register cron jobs natively. The platform handles execution, pod lifecycle, timezone, and audit logging.

## Architecture

```
Agent in pod
  └─ POST $SERVICE_GATEWAY_URL/schedules
        Authorization: Bearer $SERVICE_GATEWAY_API_KEY
        { name, cronPattern, targetPath, method }

opsiforce-backend (ClusterIP Service)
  ├─ GatewayAuthGuard validates token → { projectId, tenantId }
  ├─ ScheduleService:
  │    reads user tz from Redis cache (project:<id>:user_tz)
  │    writes project_schedules row
  │    upserts BullMQ job scheduler
  └─ BullMQ Worker on fire:
       ├─ pod running → HTTP call to pod:3000<targetPath>
       └─ pod not running → wake project → wait for ready → fire
       records execution in schedule_executions
```

The agent uses the same `SERVICE_GATEWAY_API_KEY` token used for the service gateway (email, etc). Schedule endpoints live at `/api/gateway/schedules` — sub-routes under the existing gateway prefix. No new env vars, tokens, or nginx rules.

## Security Model

| Layer | What it does |
|-------|-------------|
| **Gateway token** | Existing per-project Bearer token. Validates caller, resolves project/tenant. |
| **Cluster-internal only** | `/api/gateway` path is blocked at external nginx. Schedule endpoints are unreachable from the internet. |
| **Intra-cluster firing** | BullMQ worker calls `pod-ip:3000` directly. Never goes through the public ingress or oauth2-proxy. |
| **Wake-on-fire** | If the pod is suspended when a schedule fires, the worker wakes it using `ensureProjectById()` — same flow as a user opening the project. |

## Request Flow

```
1. Agent sends:
   POST /api/gateway/schedules
   Authorization: Bearer gw-a1b2c3d4-...
   Body: { "name": "daily-report", "cronPattern": "0 9 * * *",
           "targetPath": "/api/cron/daily-report", "method": "POST" }

2. GatewayAuthGuard:
   - Validates Bearer token → project_gateway_keys lookup
   - Sets request.gatewayContext = { projectId, tenantId }

3. ScheduleService.upsert():
   - Reads timezone from Redis: GET project:<id>:user_tz → "America/New_York"
   - INSERT INTO project_schedules ... ON CONFLICT DO UPDATE
   - BullMQ: upsertJobScheduler("schedule:<uuid>", { pattern, tz })

4. BullMQ fires at 9:00 AM America/New_York:
   - ScheduleWorker loads schedule + project
   - If pod not running: ensureProjectById() → wait for ready
   - fetch("http://<pod-ip>:3000/api/cron/daily-report", { method: "POST" })
   - INSERT INTO schedule_executions (status_code, latency_ms, ...)
```

## Timezone

Timezone is captured automatically from the user's browser — the agent never asks.

1. Frontend adds `X-User-Timezone` header to every proxy request
2. Backend caches it in Redis: `SET project:<id>:user_tz "America/New_York" EX 3600`
3. On schedule creation, the service reads the cached tz and stores it on the schedule row
4. If Redis key has expired, defaults to `UTC`
5. Timezone is editable per-schedule via the UI

## Database

### project_schedules

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `project_id` | text FK | References `projects.id`, cascade delete |
| `tenant_id` | text FK | References `tenants.id` |
| `name` | text | Unique per project (upsert key) |
| `cron_pattern` | text | 5-field cron expression |
| `time_zone` | text | IANA timezone, default `UTC` |
| `target_path` | text | App endpoint path |
| `method` | text | HTTP method, default `POST` |
| `body` | jsonb | Optional request body |
| `headers` | jsonb | Optional extra headers |
| `is_active` | boolean | Toggle, default `true` |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### schedule_executions

| Column | Type | Notes |
|--------|------|-------|
| `id` | text PK | UUID |
| `schedule_id` | text FK | References `project_schedules.id`, cascade delete |
| `trigger` | text | `cron` or `manual` |
| `fired_at` | timestamp | |
| `status_code` | integer | HTTP response status, null on network error |
| `latency_ms` | bigint | Total time including pod wake |
| `error` | text | Error message, null on success |

## API Endpoints

### Agent (GatewayAuthGuard)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/gateway/schedules` | Create or upsert schedule by name |
| GET | `/api/gateway/schedules` | List schedules for this project |
| DELETE | `/api/gateway/schedules/:name` | Delete schedule by name |

### UI (TenantGuard)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/schedules?projectId=` | All schedules for tenant (optional filter) |
| GET | `/api/projects/:id/schedules` | Schedules for a project |
| PATCH | `/api/projects/:id/schedules/:sid` | Edit schedule fields |
| POST | `/api/projects/:id/schedules/:sid/run` | Manual trigger (Run Now) |
| DELETE | `/api/projects/:id/schedules/:sid` | Delete schedule |
| GET | `/api/projects/:id/schedules/:sid/executions` | Execution history |

## Frontend

- **Global `/schedules` page** — table of all schedules across projects. Full CRUD: edit, delete, toggle active, Run Now, view executions.
- **Sidebar nav item** — "Schedules" in the user dropdown menu (near Billing).
- **Per-project 3-dot menu** — "Schedules" item navigates to `/schedules?project={projectId}`.

## Agent Skill

`agent-config/agents/app-builder/template/.opencode/skills/schedules/SKILL.md` teaches the agent:

- How to use `SERVICE_GATEWAY_URL` + `SERVICE_GATEWAY_API_KEY` for schedule CRUD
- Build the target endpoint first, then register the schedule
- Cron pattern syntax and examples
- Timezone is automatic — don't ask the user

## Files

| File | Role |
|------|------|
| `backend/db/migrations/0012_add-project-schedules.sql` | Migration |
| `backend/db/schema.ts` | `projectSchedules` + `scheduleExecutions` tables |
| `backend/src/schedule/schedule.module.ts` | NestJS module wiring |
| `backend/src/schedule/schedule.controller.agent.ts` | Agent-facing endpoints (GatewayAuthGuard) |
| `backend/src/schedule/schedule.controller.admin.ts` | UI-facing endpoints (TenantGuard) |
| `backend/src/schedule/schedule.service.ts` | DB CRUD, BullMQ sync, Redis tz, execution recording |
| `backend/src/schedule/schedule.worker.ts` | BullMQ worker — wake-on-fire, HTTP call, execution logging |
| `backend/src/schedule/schedule.types.ts` | DTOs and constants |
| `proxy/internal/server/server.go` | App preview proxy behavior; timezone still comes from `frontend/src/api/client.ts` |
| `backend/src/project/project.service.ts` | Schedule cleanup on project delete |
| `frontend/src/routes/schedules.tsx` | Route entry |
| `frontend/src/pages/schedules.tsx` | Schedules page with table, edit dialog, executions modal |
| `frontend/src/api/client.ts` | `scheduleApi` methods + `X-User-Timezone` header |
| `agent-config/agents/app-builder/template/.opencode/skills/schedules/SKILL.md` | Agent skill |

## Comparison with Service Gateway

| | Service Gateway | Schedules |
|---|---|---|
| **Purpose** | Fire-and-forget external API calls | Recurring cron-triggered HTTP callbacks |
| **Auth** | Same (`GatewayAuthGuard`) | Same |
| **Pattern** | Dispatch: `POST /api/gateway { service, payload }` | REST CRUD: `/api/gateway/schedules` |
| **Storage** | `gateway_audit_logs` | `project_schedules` + `schedule_executions` |
| **Execution** | Immediate (synchronous) | Deferred (BullMQ cron) |

Both coexist under the `/api/gateway` prefix. Same token, same guard, same nginx rule.

## Future Work

- **Prompt mode** — schedule wakes the agent with a prompt instead of calling an endpoint
- **Max schedules per project** — cap BullMQ load (e.g. 50)
- **One-shot jobs** — "at" timestamp scheduling, not just cron

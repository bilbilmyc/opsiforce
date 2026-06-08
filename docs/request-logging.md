# Request Logging

Every project's app traffic flows through the central **app-mode runtime proxy**, which records each HTTP request to a per-project SQLite log (`app_requests`) that the DB Viewer surfaces. Request Logging lets each project choose **how much** of that traffic is recorded — from full request/response bodies down to nothing at all.

## Why

The app proxy is a single, shared process: one deployment handles every project's app traffic and writes each project's log on the shared workspace volume. To record a request or response body, the proxy historically had to **buffer the whole body in memory** before forwarding it. For a chat-style app streaming large LLM responses, that meant:

- Latency — the client waited for the proxy to read the entire upstream response before it saw a byte
- Broken streaming — Server-Sent Events and chunked responses were silently buffered to completion
- Memory pressure — hundreds of concurrent large bodies piling up in one process, which in turn backed up the downstream app→Bifrost calls

Logging is valuable for debugging, but for a high-traffic app the cost of capturing bodies can outweigh it. Request Logging makes that trade-off a per-project choice instead of a platform-wide constant.

## How it works

There are three logging levels, chosen per project:

- **Off** — nothing is logged. The proxy streams every request and response without buffering. Lowest overhead.
- **Metadata only** — method, path, status, latency, size, and (redacted) headers are logged. No bodies, so no body buffering. Responses still stream.
- **Full** — metadata plus request and response bodies, each truncated to a configurable byte limit (per-project, capped at a 256 KB ceiling).

Even in **Full** mode the proxy no longer buffers whole bodies: it streams the response to the client while *tee-ing* only the first N bytes into the log. Memory per request is bounded by the byte limit — and across the shared proxy by the 256 KB ceiling — and streaming is preserved regardless of level. Credentials and session material — `Authorization`, `Cookie`, and tokens including the internal `x-proxy-control-token` — are always redacted before they reach the log. End-user identity headers (such as `x-forwarded-email`) are deliberately left visible, as debugging signal rather than secrets.

The setting lives on the project, and the proxy learns it through the channel it already uses: the per-request `ensure` call to the backend control plane (cached for a few seconds) now also returns the project's logging policy. Changing a project's level takes effect within seconds — no pod restart, no proxy redeploy. When the control plane sends no policy (older backend, or a non-app surface) the proxy falls back to full logging, so behaviour is unchanged until a project opts into something lighter.

This is independent of, and complementary to, the platform's **retention** cleanup, which separately prunes old log rows on a schedule.

## Architecture

The implementation touches four layers:

1. **Data** — two columns on `project_settings` (`request_log_mode`, `request_log_body_limit`) and a DB migration
2. **Control plane** — a guarded `PUT /projects/:id/logging` endpoint, and the logging policy added to the proxy `ensure` response
3. **Proxy** — the Go app proxy resolves the policy per request and gates body capture; capture is a bounded streaming tee, not a buffer
4. **UI** — a "Logging" tab in Project Settings, gated by a dedicated permission

```
Project Settings UI            Backend                      App runtime proxy (Go)
+----------------+   PUT       +------------------+         +-----------------------+
| Logging tab    | ----------> | PUT /:id/logging |         | per request:          |
|  Off/Meta/Full | /logging    |  (perm-guarded)  |         |   ensure() -> policy  |
|  body limit KB |             |  -> project_     |  ensure |   off  -> stream only |
+----------------+             |     settings     | <-----  |   meta -> + metadata  |
                               |                  |  policy |   full -> + tee N bytes|
                               | ensure() returns |  ------> |                       |
                               |   logging policy |         |   redact headers,     |
                               +------------------+         |   truncate at capture |
                                                            +-----------------------+
```

## Who can use it

Changing a project's logging level requires the `can_manage_project_logging_settings` permission (Keycloak group `opsiforce_manage_project_logging_settings`), provisioned by the keycloak-configurator alongside the other project-settings permissions. Reading the current level needs no special permission — it travels on the normal project payload.

## Where the code lives

- Schema + migration: `backend/db/schema.ts`, `backend/db/migrations/0037_add-project-request-log-settings.sql`
- Endpoint + policy: `backend/src/project/project.controller.ts`, `project.service.ts`, `backend/src/proxy/proxy.controller.ts`
- Proxy logic: `proxy/internal/server/server.go` (policy resolution, streaming tee, header redaction), `proxy/internal/requestlog/logger.go`
- UI: `frontend/src/components/project-settings.tsx`, `frontend/src/components/ui/request-logging-controls.tsx`
- Permission: `backend/src/permission/permission.constants.ts`, `frontend/src/constants/permissions.ts`, `infra/pulumi/keycloak-configurator/opsiforce/`

See also [LLM Gateway](llm-gateway.md) (Bifrost, the downstream that backs up when the proxy stalls) and [DB Viewer](db-viewer.md) (where `app_requests` logs are surfaced).

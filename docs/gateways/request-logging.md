# Request Logging

> Per-project control over how much of an app's live traffic the app-mode proxy records. Read this to understand the Off/Metadata/Full policy and why it exists.

Every project's app traffic flows through the shared **app-mode runtime proxy**, which records each HTTP request to a per-project SQLite log (`app_requests`) that the [DB Viewer](../runtime/pod-tools.md) surfaces. Request Logging lets each project choose **how much** is recorded:

- **Off** — nothing logged; the proxy streams every request/response without buffering. Lowest overhead.
- **Metadata** — method, path, status, latency, size, redacted headers. No bodies, so no body buffering.
- **Full** — metadata plus request/response bodies, each truncated to a per-project byte limit (capped at a 256 KB ceiling). **Full is the default**, so existing projects are unchanged.

## Why it exists, and why it's safe at Full

The proxy is one shared process handling every project's traffic. The original design buffered whole bodies in memory *just to log them*, which — for a chat-style app streaming large LLM responses with no `Content-Length` — broke streaming, added latency, and stacked full in-memory copies under concurrency (backing up the downstream app→Bifrost calls). The fix decouples the *mechanism* from the *policy*: even at Full, the proxy now **streams the response while tee-ing only the first N bytes** into the log, so memory per request is bounded by the byte limit regardless of body size and streaming is preserved at every level. That is why Full can stay the default (it's now safe) while Metadata/Off exist for projects that want less. The full rationale and the rejected alternatives are [ADR-0006](../adr/0006-request-log-streaming-tee.md).

Credentials and session material (`Authorization`, `Cookie`, and the internal `x-proxy-control-token`) are always redacted before reaching the log; end-user identity headers like `x-forwarded-email` are deliberately left visible as debugging signal.

The proxy learns a project's level over the channel it already uses — the per-request `ensure` call returns the logging policy (cached a few seconds), so a change takes effect within seconds with no pod restart or proxy redeploy. An absent policy (older backend, non-app surface) falls back to Full. This is independent of, and complementary to, the platform's separate log-**retention** cleanup.

## Who can use it

Changing a project's level requires `can_manage_project_logging_settings`. Reading the current level needs no special permission — it rides the normal project payload.

## See also

- [DB Viewer](../runtime/pod-tools.md) — where `app_requests` logs are surfaced.
- [LLM Gateway](llm-gateway.md) — the downstream that backed up when the proxy stalled.
- [ADR-0006](../adr/0006-request-log-streaming-tee.md) — the streaming-tee decision.
- Code: `proxy/internal/server/server.go` (policy resolution, streaming tee, redaction) + `proxy/internal/requestlog/`; `backend/src/project/` (the guarded `PUT /:id/logging` endpoint, policy on the `ensure` response); settings in `project_settings` (`request_log_mode`, `request_log_body_limit`).

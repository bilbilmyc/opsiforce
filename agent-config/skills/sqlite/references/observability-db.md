# Platform observability DB (debugging)

A second, **read-only** SQLite file at `/workspace/data/database.db` records everything the platform sees — separate from your app's `data/app.db`. Never create tables or write to it; always open with `-readonly`. Use it to investigate bugs, failed requests, and crashes **before guessing**, and to confirm the dev servers booted cleanly after edits.

**Tables:**

| Table | What it captures | Key columns |
|-------|-----------------|-------------|
| `app_requests` | All HTTP requests to the app | `method`, `url`, `status`, `duration_ms`, `request_body`, `response_body`, `request_headers`, `response_headers`, `size`, `domain`, `created_at` |
| `process_logs` | stdout/stderr from all processes | `process_name` (see below), `line`, `created_at` |
| `process_events` | Structured lifecycle events | `process_name`, `event` (started/crashed/stopped/signal/gave_up), `exit_code`, `uptime_seconds`, `restart_count`, `created_at` |

**Process names** (if unsure, `SELECT DISTINCT process_name FROM process_logs`): `app-backend` (NestJS :3100), `app-frontend` (Vite :3000), `webapp` (startup supervisor meta-lines only, not dev-server output), `opencode` (agent), `vscode` (code-server).

## Investigate bugs / failed requests

```bash
# Recent requests
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT method, url, status, duration_ms, created_at FROM app_requests ORDER BY id DESC LIMIT 50"

# 4xx/5xx in the last hour, with response body
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT method, url, status, substr(response_body,1,200) AS body, created_at
   FROM app_requests WHERE status >= 400 AND created_at > datetime('now','-1 hour') ORDER BY id DESC"

# Slowest requests
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT method, url, status, duration_ms, created_at FROM app_requests ORDER BY duration_ms DESC LIMIT 20"

# Output from one process
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT created_at, line FROM process_logs WHERE process_name='app-backend' ORDER BY id DESC LIMIT 50"

# Error lines across all processes
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT created_at, process_name, line FROM process_logs
   WHERE line LIKE '%error%' OR line LIKE '%FAIL%' ORDER BY id DESC LIMIT 50"

# Lifecycle events
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT created_at, process_name, event, exit_code, uptime_seconds, restart_count FROM process_events ORDER BY id DESC LIMIT 50"
```

## Verify the app booted (run after every round of edits)

Both queries should come back empty (or show only healthy `started` events) before opening `agent-browser` or telling the user a feature is done:

```bash
# 1. Crashes in the last 2 minutes (event='crashed' / 'gave_up')
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT created_at, process_name, event, exit_code, uptime_seconds, restart_count
   FROM process_events WHERE created_at > datetime('now','-2 minutes') ORDER BY id DESC"

# 2. Error lines from the dev servers in the last 2 minutes
sqlite3 -readonly -header -column /workspace/data/database.db \
  "SELECT created_at, process_name, line FROM process_logs
   WHERE process_name LIKE 'app-%' AND created_at > datetime('now','-2 minutes')
     AND (line LIKE '%error%' OR line LIKE '%Error%' OR line LIKE '%FAIL%' OR line LIKE '%Cannot find%' OR line LIKE '%Unexpected%')
   ORDER BY id DESC LIMIT 50"
```

Reading results: a recent `event='crashed'` with climbing `restart_count` and small `uptime_seconds` = crashlooping (hard error — fix before continuing); `event='started'` with nothing else recent = healthy. Common culprits: a NestJS module not registered in `app.module.ts`, a SQL migration syntax error, a TypeScript runtime error from an import typo, Vite failing to compile. If both queries are empty and `curl http://localhost:3100/api/health` returns 200, you're good.

**Tips:** always `-readonly`; `-header -column` for readable output (drop it for piping); date filters like `datetime('now','-N hours')` or compare `created_at` to ISO strings (`'2026-04-13'`). Your app DB is a plain file too — `sqlite3 /workspace/app/data/app.db ".tables"` / `.schema items`.

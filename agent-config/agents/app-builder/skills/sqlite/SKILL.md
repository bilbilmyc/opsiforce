---
name: sqlite
description: SQLite database via Node 24's built-in node:sqlite — migrations, DatabaseService API, queries, transactions, upserts, full-text search (FTS5), JSON, window functions, indexes, performance. Use for any data model change, schema work, or SQL query. Every data model change starts here with a migration file.
---

# SQLite

The app uses Node 24's built-in `node:sqlite` (`DatabaseSync`). Synchronous API, zero dependencies, no native compile step. Imported as `import { DatabaseSync } from "node:sqlite"`. Database file is at `data/app.db`.

There is also a per-project platform-managed observability database at `/workspace/data/database.db` (tables: `app_requests`, `process_logs`, `process_events`). Do not create tables or write to it — always open with `sqlite3 -readonly /workspace/data/database.db "..."`. See [§Platform observability DB (debugging)](#platform-observability-db-debugging) below for schema details and example queries.

## DatabaseService API

Inject in any NestJS service:

```typescript
import { DatabaseService } from "../database/database.service"

constructor(private readonly db: DatabaseService) {}
```

### Methods — complete reference (do not invent methods not listed here)

| Method | Returns | Use for |
|---|---|---|
| `queryAll<T>(sql, params?)` | `T[]` | SELECT multiple rows |
| `queryOne<T>(sql, params?)` | `T \| undefined` | SELECT single row |
| `run(sql, params?)` | `{ changes, lastInsertRowid }` | INSERT, UPDATE, DELETE |
| `exec(sql)` | `void` | Raw SQL (DDL, multiple statements) |

### Examples

```typescript
// SELECT all
const items = this.db.queryAll<Item>("SELECT * FROM items WHERE status = ?", ["active"])

// SELECT one
const item = this.db.queryOne<Item>("SELECT * FROM items WHERE id = ?", [id])

// INSERT
const result = this.db.run("INSERT INTO items (title) VALUES (?)", ["New item"])
const newId = result.lastInsertRowid

// UPDATE
this.db.run("UPDATE items SET title = ?, updated_at = datetime('now') WHERE id = ?", ["Updated", id])

// DELETE
this.db.run("DELETE FROM items WHERE id = ?", [id])

// COUNT
const { count } = this.db.queryOne<{ count: number }>("SELECT COUNT(*) as count FROM items")!
```

## Creating tables — migrations

Create `.sql` files in `backend/src/migrations/`:

```
backend/src/migrations/
  001_create_items.sql     ← existing (do not modify)
  002_create_tasks.sql     ← your new migration
  003_add_categories.sql   ← another migration
```

### Rules

- Files run in alphabetical order, each only once
- Migrations run **automatically on every boot** (dev and production), each in its **own transaction** (the whole file commits, or rolls back on error). Once a migration has run it is recorded and skipped forever.
- **Never modify an existing migration** — it has already been applied and won't re-run; editing it has no effect (and in production would diverge environments). Every schema change is a **new** file.
- **Never modify the existing `items` table** — create your own tables
- Naming: `NNN_description.sql`

### Migration template

```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'medium',
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Common patterns

```sql
-- Foreign key
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for performance
CREATE INDEX idx_comments_task_id ON comments(task_id);

-- Unique constraint
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- Alter table (add column)
ALTER TABLE tasks ADD COLUMN assigned_to TEXT;
```

### Data types

- `TEXT` — strings, dates (ISO format via `datetime('now')`)
- `INTEGER` — numbers, booleans (0/1)
- `REAL` — floating point
- `BLOB` — binary data

## Transactions (batch operations — 10-100x faster)

```typescript
this.db.exec("BEGIN")
try {
  for (const item of items) {
    this.db.run("INSERT INTO items (title) VALUES (?)", [item.title])
  }
  this.db.exec("COMMIT")
} catch (e) {
  this.db.exec("ROLLBACK")
  throw e
}
```

**Always** wrap in try/catch with ROLLBACK. Without it, a failed insert leaves the transaction open and blocks writes.

## UPSERT (insert or update)

```sql
INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');
```

Requires a UNIQUE constraint on the conflict column.

## Full-text search (FTS5)

```sql
-- Migration: create FTS table
CREATE VIRTUAL TABLE items_fts USING fts5(title, description);

-- Trigger to keep in sync
CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
  DELETE FROM items_fts WHERE rowid = old.id;
END;
CREATE TRIGGER items_au AFTER UPDATE ON items BEGIN
  DELETE FROM items_fts WHERE rowid = old.id;
  INSERT INTO items_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
```

```typescript
// Search
this.db.queryAll(`
  SELECT i.* FROM items i
  JOIN items_fts fts ON i.id = fts.rowid
  WHERE items_fts MATCH ?
  ORDER BY rank
`, [searchQuery])
```

## JSON support

```sql
-- Store JSON in a TEXT column
INSERT INTO items (metadata) VALUES ('{"color":"blue","tags":["work","urgent"]}');

-- Query JSON fields
SELECT *, json_extract(metadata, '$.color') as color FROM items
WHERE json_extract(metadata, '$.active') = 1;

-- JSON array operations
SELECT * FROM items WHERE json_array_length(json_extract(metadata, '$.tags')) > 0;
```

## Window functions

```sql
-- Row numbering
SELECT *, ROW_NUMBER() OVER (ORDER BY created_at DESC) as row_num FROM items;

-- Running total
SELECT *, SUM(amount) OVER (ORDER BY created_at) as running_total FROM transactions;

-- Rank within groups
SELECT *, RANK() OVER (PARTITION BY category ORDER BY score DESC) as category_rank FROM items;
```

## Common aggregate patterns

```sql
-- Group by with counts
SELECT status, COUNT(*) as count FROM tasks GROUP BY status;

-- Group by date (day)
SELECT date(created_at) as day, COUNT(*) as count FROM items GROUP BY date(created_at) ORDER BY day DESC;

-- Group by month
SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM items GROUP BY month ORDER BY month DESC;
```

## Performance

- `PRAGMA journal_mode = TRUNCATE` — already set for CephFS compatibility
- `PRAGMA synchronous = FULL` — already set for durability; avoid long write transactions
- `CREATE INDEX idx_items_status ON items(status)` — always index columns used in WHERE/ORDER BY
- `EXPLAIN QUERY PLAN SELECT ...` — run to debug slow queries
- Wrap batch inserts in BEGIN/COMMIT (10-100x faster than individual inserts)
- Use `LIMIT` and `OFFSET` for pagination: `SELECT * FROM items ORDER BY id DESC LIMIT 20 OFFSET 40`

## Common mistakes

1. **Not indexing foreign keys** — SQLite doesn't auto-index FK columns. Always `CREATE INDEX idx_comments_task_id ON comments(task_id)`.
2. **Forgetting ROLLBACK** — if an error happens mid-transaction without ROLLBACK, the transaction stays open and blocks writes.
3. **Using `LIKE '%query%'` for search** — full table scan. Use FTS5 for text search.

## Platform observability DB (debugging)

A second, **read-only** SQLite file at `/workspace/data/database.db` records everything the platform sees — separate from your app's `data/app.db`. Never create tables or write to it; always open with `-readonly`. Use it to investigate bugs, failed requests, and crashes **before guessing**, and to confirm the dev servers booted cleanly after edits.

**Tables:**

| Table | What it captures | Key columns |
|-------|-----------------|-------------|
| `app_requests` | All HTTP requests to the app | `method`, `url`, `status`, `duration_ms`, `request_body`, `response_body`, `request_headers`, `response_headers`, `size`, `domain`, `created_at` |
| `process_logs` | stdout/stderr from all processes | `process_name` (see below), `line`, `created_at` |
| `process_events` | Structured lifecycle events | `process_name`, `event` (started/crashed/stopped/signal/gave_up), `exit_code`, `uptime_seconds`, `restart_count`, `created_at` |

**Process names** (if unsure, `SELECT DISTINCT process_name FROM process_logs`): `app-backend` (NestJS :3100), `app-frontend` (Vite :3000), `webapp` (startup supervisor meta-lines only, not dev-server output), `opencode` (agent), `vscode` (code-server).

### Investigate bugs / failed requests

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

### Verify the app booted (run after every round of edits)

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

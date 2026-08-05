---
name: sqlite
description: SQLite database via Node 24's built-in node:sqlite — migrations, DatabaseService API, full-text search (FTS5), and the read-only platform databases (observability, inbound external-service messages). Use for any data model change, schema work, or SQL query. Every data model change starts here with a migration file.
---

# SQLite

The app uses Node 24's built-in `node:sqlite` (`DatabaseSync`). Synchronous API, zero dependencies, no native compile step. Imported as `import { DatabaseSync } from "node:sqlite"`. Database file is at `data/app.db`.

There is also a per-project platform-managed observability database at `/workspace/data/database.db` (tables: `app_requests`, `process_logs`, `process_events`). Do not create tables or write to it — always open with `sqlite3 -readonly /workspace/data/database.db "..."`. When debugging a failed request, crash, or error, Read references/observability-db.md — it has the platform DB schema and ready-to-run queries.

## Inbound messages — `/workspace/data/external-services.db`

A third platform-managed file holds inbound messages from external services (incoming email, WhatsApp). **The platform backend is the only writer** — agents, app code, and the DB viewer are read-only. Never create tables, write, or run migrations against it; open it with `sqlite3 -readonly` or `new DatabaseSync(path, { readOnly: true })`.

One table per service, created lazily the first time a message arrives — until then the file is empty, which is normal. Every service table shares the same convention columns:

| Column | Meaning |
|---|---|
| `id` | row id, the value the doorbell POST sends in `rowIds` |
| `received_at` | when the platform stored the message |
| `raw_payload` | the provider's original payload, as received |
| `app_delivered_at` | when the app's doorbell handler ACKed — `NULL` means it never did |

`app_delivered_at` is the "was the app rung?" signal. Delivery is a single fire-and-forget attempt with no retries, so `NULL` rows are the ones the app has not processed — either no handler was declared or the pod was cold when the message landed. Reading undelivered rows is how an app catches up, and it is the first thing to check when a message "never arrived":

```bash
sqlite3 -readonly -header -column /workspace/data/external-services.db \
  "SELECT id, received_at, app_delivered_at FROM incoming_emails ORDER BY id DESC LIMIT 20;"
```

```typescript
import { DatabaseSync } from "node:sqlite"

const db = new DatabaseSync("/workspace/data/external-services.db", { readOnly: true })
const pending = db.prepare("SELECT * FROM incoming_emails WHERE app_delivered_at IS NULL ORDER BY id").all()
```

Per-service table columns and the handler contract live in that service's own skill (`incoming-email`, `whatsapp`) — load it before wiring an app to a service.

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

---
name: better-sqlite3
description: Advanced SQLite operations via better-sqlite3 — transactions, full-text search, JSON, window functions, upserts, performance optimization. Use for complex database operations beyond basic CRUD.
---

# Advanced SQLite (better-sqlite3)

The app uses `better-sqlite3` — the fastest SQLite driver for Node.js. Synchronous API, zero-copy data access.

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

**Always** wrap in try/catch with ROLLBACK. Without it, a failed insert leaves the transaction open.

## UPSERT (insert or update)

```sql
INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');
```

Requires a UNIQUE constraint on the conflict column.

## Full-text search

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

- `PRAGMA journal_mode = WAL` — already set (concurrent reads)
- `CREATE INDEX idx_items_status ON items(status)` — always index columns used in WHERE/ORDER BY
- `EXPLAIN QUERY PLAN SELECT ...` — run to debug slow queries
- Wrap batch inserts in BEGIN/COMMIT (10-100x faster than individual inserts)
- Use `LIMIT` and `OFFSET` for pagination: `SELECT * FROM items ORDER BY id DESC LIMIT 20 OFFSET 40`

## Common mistakes

1. **Not indexing foreign keys** — SQLite doesn't auto-index FK columns. Always `CREATE INDEX idx_comments_task_id ON comments(task_id)`.
2. **Forgetting ROLLBACK** — if an error happens mid-transaction without ROLLBACK, the transaction stays open and blocks writes.
3. **Using `LIKE '%query%'` for search** — full table scan. Use FTS5 for text search.

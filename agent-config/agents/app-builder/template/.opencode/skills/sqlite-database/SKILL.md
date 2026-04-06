---
name: sqlite-database
description: Work with SQLite database — create tables via migrations, write queries, manage schema. Use when you need to store data, add new database tables, modify schema, or write any SQL. Every data model change starts here with a migration file.
---

# SQLite Database

The app uses bun:sqlite with a migration system. Database file is at `data/app.db`.

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
- **Never modify an existing migration** — always create a new file
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

import Database from "better-sqlite3"
import * as path from "path"
import * as fs from "fs"
import type { AppRequestEntry } from "./app-request.types"

const MAX_BODY_SIZE = 10 * 1024
const MAX_ROWS = 50_000
const PRUNE_TO = 40_000
const PRUNE_INTERVAL = 500

interface CachedDb {
  db: Database.Database
  lastUsed: number
  insertCount: number
}

export class AppRequestLogger {
  private readonly cache = new Map<string, CachedDb>()
  private readonly cleanupInterval: ReturnType<typeof setInterval>

  constructor(private readonly storageMountPath: string) {
    this.cleanupInterval = setInterval(() => this.closeIdle(), 60_000)
  }

  log(directory: string, entry: AppRequestEntry): void {
    if (!this.storageMountPath) return

    try {
      const cached = this.getOrOpen(directory)
      cached.db.prepare(
        `INSERT INTO app_requests (method, url, domain, source_ip, status, size, duration_ms, request_headers, response_headers, request_body, response_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.method,
        entry.url,
        entry.domain,
        entry.sourceIp,
        entry.status,
        entry.size,
        entry.durationMs,
        entry.requestHeaders,
        entry.responseHeaders,
        truncate(entry.requestBody),
        truncate(entry.responseBody),
      )
      cached.insertCount++
      if (cached.insertCount % PRUNE_INTERVAL === 0) {
        this.pruneIfNeeded(cached.db)
      }
    } catch {}
  }

  close(): void {
    clearInterval(this.cleanupInterval)
    for (const [, { db }] of this.cache) {
      try { db.close() } catch {}
    }
    this.cache.clear()
  }

  private getOrOpen(directory: string): CachedDb {
    const existing = this.cache.get(directory)
    if (existing) {
      existing.lastUsed = Date.now()
      return existing
    }

    const dbPath = path.join(this.storageMountPath, directory, "data", "database.db")
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    const db = new Database(dbPath)
    db.pragma("busy_timeout = 5000")
    db.pragma("journal_mode = TRUNCATE")
    db.pragma("synchronous = FULL")
    db.exec(`CREATE TABLE IF NOT EXISTS app_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT,
      source_ip TEXT,
      status INTEGER,
      size INTEGER,
      duration_ms INTEGER,
      request_headers TEXT,
      response_headers TEXT,
      request_body TEXT,
      response_body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    const hasSourceIp = (db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('app_requests') WHERE name = 'source_ip'")
      .get() as { c: number }).c > 0
    if (!hasSourceIp) {
      db.exec("ALTER TABLE app_requests ADD COLUMN source_ip TEXT")
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_app_requests_created_at ON app_requests(created_at)")
    db.exec("CREATE INDEX IF NOT EXISTS idx_app_requests_status ON app_requests(status)")
    db.exec("CREATE INDEX IF NOT EXISTS idx_app_requests_source_ip ON app_requests(source_ip)")

    const cached = { db, lastUsed: Date.now(), insertCount: 0 }
    this.cache.set(directory, cached)
    return cached
  }

  private pruneIfNeeded(db: Database.Database): void {
    try {
      const row = db.prepare("SELECT COUNT(*) as count FROM app_requests").get() as { count: number }
      if (row.count > MAX_ROWS) {
        db.exec(`DELETE FROM app_requests WHERE id IN (
          SELECT id FROM app_requests ORDER BY id ASC LIMIT ${row.count - PRUNE_TO}
        )`)
      }
    } catch {}
  }

  private closeIdle(): void {
    const cutoff = Date.now() - 5 * 60_000
    for (const [key, { db, lastUsed }] of this.cache) {
      if (lastUsed < cutoff) {
        try { db.close() } catch {}
        this.cache.delete(key)
      }
    }
  }
}

function truncate(value: string | null): string | null {
  if (!value) return value
  return value.length > MAX_BODY_SIZE ? value.slice(0, MAX_BODY_SIZE) : value
}

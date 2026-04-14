import { open, type Database } from "sqlite"
import sqlite3 from "sqlite3"
import * as path from "path"
import { mkdir } from "fs/promises"
import type { AppRequestEntry } from "./app-request.types"

const MAX_BODY_SIZE = 10 * 1024
const MAX_ROWS = 50_000
const PRUNE_TO = 40_000
const PRUNE_INTERVAL = 500

interface CachedDb {
  db: Database
  lastUsed: number
  insertCount: number
}

export class AppRequestLogger {
  private readonly cache = new Map<string, CachedDb>()
  private readonly pending = new Map<string, Promise<CachedDb>>()
  private readonly cleanupInterval: ReturnType<typeof setInterval>

  constructor(private readonly storageMountPath: string) {
    this.cleanupInterval = setInterval(() => this.closeIdle(), 60_000)
  }

  async log(directory: string, entry: AppRequestEntry): Promise<void> {
    if (!this.storageMountPath) return

    try {
      const cached = await this.getOrOpen(directory)
      await cached.db.run(
        `INSERT INTO app_requests (method, url, domain, source_ip, status, size, duration_ms, request_headers, response_headers, request_body, response_body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        await this.pruneIfNeeded(cached.db)
      }
    } catch {}
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupInterval)
    await Promise.all(
      [...this.cache.values()].map(({ db }) => db.close().catch(() => {})),
    )
    this.cache.clear()
  }

  private async getOrOpen(directory: string): Promise<CachedDb> {
    const existing = this.cache.get(directory)
    if (existing) {
      existing.lastUsed = Date.now()
      return existing
    }

    const pendingInit = this.pending.get(directory)
    if (pendingInit) return pendingInit

    const initPromise = this.initDb(directory)
    this.pending.set(directory, initPromise)
    try {
      return await initPromise
    } finally {
      this.pending.delete(directory)
    }
  }

  private async initDb(directory: string): Promise<CachedDb> {
    const dbPath = path.join(this.storageMountPath, directory, "data", "database.db")
    await mkdir(path.dirname(dbPath), { recursive: true })

    const db = await open({ filename: dbPath, driver: sqlite3.Database })
    await db.exec("PRAGMA busy_timeout = 5000")
    await db.exec("PRAGMA journal_mode = TRUNCATE")
    await db.exec("PRAGMA synchronous = FULL")
    await db.exec(`CREATE TABLE IF NOT EXISTS app_requests (
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
    const row = await db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM pragma_table_info('app_requests') WHERE name = 'source_ip'",
    )
    if (row && row.c === 0) {
      await db.exec("ALTER TABLE app_requests ADD COLUMN source_ip TEXT")
    }
    await db.exec("CREATE INDEX IF NOT EXISTS idx_app_requests_created_at ON app_requests(created_at)")
    await db.exec("CREATE INDEX IF NOT EXISTS idx_app_requests_status ON app_requests(status)")
    await db.exec("CREATE INDEX IF NOT EXISTS idx_app_requests_source_ip ON app_requests(source_ip)")

    const cached = { db, lastUsed: Date.now(), insertCount: 0 }
    this.cache.set(directory, cached)
    return cached
  }

  private async pruneIfNeeded(db: Database): Promise<void> {
    try {
      const row = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM app_requests")
      if (row && row.count > MAX_ROWS) {
        await db.exec(`DELETE FROM app_requests WHERE id IN (
          SELECT id FROM app_requests ORDER BY id ASC LIMIT ${row.count - PRUNE_TO}
        )`)
      }
    } catch {}
  }

  private closeIdle(): void {
    const cutoff = Date.now() - 5 * 60_000
    for (const [key, { db, lastUsed }] of this.cache) {
      if (lastUsed < cutoff) {
        db.close().catch(() => {})
        this.cache.delete(key)
      }
    }
  }
}

function truncate(value: string | null): string | null {
  if (!value) return value
  return value.length > MAX_BODY_SIZE ? value.slice(0, MAX_BODY_SIZE) : value
}

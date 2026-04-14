import { Injectable, OnModuleInit } from "@nestjs/common"
import { Database, type SQLQueryBindings } from "bun:sqlite"
import * as path from "path"
import * as fs from "fs"

@Injectable()
export class DatabaseService implements OnModuleInit {
  private db!: Database

  onModuleInit() {
    const dbPath = path.resolve(process.cwd(), "data", "app.db")
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec("PRAGMA journal_mode = TRUNCATE")
    this.db.exec("PRAGMA synchronous = FULL")
    this.runMigrations()
  }

  queryAll<T = Record<string, unknown>>(sql: string, params: SQLQueryBindings[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[]
  }

  queryOne<T = Record<string, unknown>>(sql: string, params: SQLQueryBindings[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined
  }

  run(sql: string, params: SQLQueryBindings[] = []) {
    return this.db.prepare(sql).run(...params)
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  private runMigrations() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)

    const migrationsDir = path.resolve(process.cwd(), "backend", "src", "migrations")
    if (!fs.existsSync(migrationsDir)) return

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    const applied = new Set(
      this.queryAll<{ name: string }>("SELECT name FROM _migrations").map((r) => r.name),
    )

    for (const file of files) {
      if (applied.has(file)) continue
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8")
      this.db.exec(sql)
      this.run("INSERT INTO _migrations (name) VALUES (?)", [file])
    }
  }
}

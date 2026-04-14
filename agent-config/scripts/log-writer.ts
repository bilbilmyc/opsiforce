#!/usr/bin/env bun
import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { parseArgs } from "util"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    name: { type: "string" },
    line: { type: "string" },
    event: { type: "string" },
    "exit-code": { type: "string" },
    uptime: { type: "string" },
    restart: { type: "string" },
  },
})

const processName = values.name || "unknown"
const DB_PATH = "/workspace/data/database.db"
const MAX_ROWS = 50_000
const PRUNE_TO = 40_000
const PRUNE_INTERVAL = 1000
const BATCH_SIZE = 100
const FLUSH_MS = 500
const MAX_LINE_LENGTH = 10 * 1024

let db: Database | null = null
let insertStmt: ReturnType<Database["prepare"]> | null = null
let eventStmt: ReturnType<Database["prepare"]> | null = null
let totalInserts = 0
let batch: string[] = []
let flushTimer: Timer | null = null

function initDb(): boolean {
  try {
    mkdirSync("/workspace/data", { recursive: true })
    db = new Database(DB_PATH)
    db.exec("PRAGMA busy_timeout = 5000")
    db.exec("PRAGMA journal_mode = TRUNCATE")
    db.exec("PRAGMA synchronous = FULL")
    db.exec(`CREATE TABLE IF NOT EXISTS process_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_name TEXT NOT NULL,
      line TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    db.exec(`CREATE TABLE IF NOT EXISTS process_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_name TEXT NOT NULL,
      event TEXT NOT NULL,
      exit_code INTEGER,
      uptime_seconds INTEGER,
      restart_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    db.exec("CREATE INDEX IF NOT EXISTS idx_process_logs_process_name ON process_logs(process_name)")
    db.exec("CREATE INDEX IF NOT EXISTS idx_process_logs_created_at ON process_logs(created_at)")
    db.exec("CREATE INDEX IF NOT EXISTS idx_process_events_process_name ON process_events(process_name)")
    insertStmt = db.prepare("INSERT INTO process_logs (process_name, line) VALUES (?, ?)")
    eventStmt = db.prepare("INSERT INTO process_events (process_name, event, exit_code, uptime_seconds, restart_count) VALUES (?, ?, ?, ?, ?)")
    return true
  } catch {
    db = null
    return false
  }
}

function truncateLine(line: string): string {
  return line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) : line
}

function flushBatch() {
  if (batch.length === 0 || !db || !insertStmt) return
  try {
    const tx = db.transaction(() => {
      for (const line of batch) {
        insertStmt!.run(processName, truncateLine(line))
      }
    })
    tx()
    totalInserts += batch.length
    batch = []

    if (totalInserts % PRUNE_INTERVAL < BATCH_SIZE) {
      pruneIfNeeded()
    }
  } catch {
    batch = []
  }
}

function pruneIfNeeded() {
  if (!db) return
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM process_logs").get() as { count: number }
    if (row.count > MAX_ROWS) {
      db.exec(`DELETE FROM process_logs WHERE id IN (
        SELECT id FROM process_logs ORDER BY id ASC LIMIT ${row.count - PRUNE_TO}
      )`)
    }
  } catch {}
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushBatch()
  }, FLUSH_MS)
}

function addLine(line: string) {
  batch.push(line)
  if (batch.length >= BATCH_SIZE) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    flushBatch()
  } else {
    scheduleFlush()
  }
}

function insertEvent() {
  if (!db || !eventStmt) return
  try {
    eventStmt.run(
      processName,
      values.event!,
      values["exit-code"] ? parseInt(values["exit-code"], 10) : null,
      values.uptime ? parseInt(values.uptime, 10) : null,
      values.restart ? parseInt(values.restart, 10) : null,
    )
  } catch {}
}

initDb()

if (values.event !== undefined) {
  insertEvent()
  if (db) try { db.close() } catch {}
  process.exit(0)
}

if (values.line !== undefined) {
  addLine(values.line)
  flushBatch()
  if (db) try { db.close() } catch {}
  process.exit(0)
}

const writer = Bun.stdout.writer()
const decoder = new TextDecoder()
let remainder = ""

async function readStdin() {
  try {
    for await (const chunk of Bun.stdin.stream()) {
      const text = remainder + decoder.decode(chunk, { stream: true })
      const lines = text.split("\n")
      remainder = lines.pop() || ""

      for (const line of lines) {
        writer.write(line + "\n")
        addLine(line)
      }
      writer.flush()
    }

    if (remainder) {
      writer.write(remainder + "\n")
      writer.flush()
      addLine(remainder)
    }
  } catch {}

  flushBatch()
  if (db) try { db.close() } catch {}
}

readStdin()

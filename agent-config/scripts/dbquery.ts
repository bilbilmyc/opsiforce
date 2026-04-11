#!/usr/bin/env bun
import { Database } from "bun:sqlite"

const DB_PATH = "/workspace/data/database.db"
const [command, ...args] = Bun.argv.slice(2)

let db: Database
try {
  db = new Database(DB_PATH, { readonly: true })
} catch {
  console.error("Database not found at " + DB_PATH)
  process.exit(1)
}

const limit = 50

function tableExists(name: string): boolean {
  const row = db.query("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name=?").get(name) as { c: number }
  return row.c > 0
}

function requests() {
  if (!tableExists("app_requests")) {
    console.log("No app requests recorded yet. Requests are logged when HTTP traffic flows through the app proxy.")
    return
  }
  const filter = args[0]
  if (filter === "errors") {
    console.table(db.query("SELECT method, url, status, duration_ms, substr(response_body, 1, 200) as response_body, created_at FROM app_requests WHERE status >= 400 ORDER BY id DESC LIMIT ?").all(limit))
  } else if (filter === "slow") {
    console.table(db.query("SELECT method, url, status, duration_ms, created_at FROM app_requests ORDER BY duration_ms DESC LIMIT ?").all(limit))
  } else {
    console.table(db.query("SELECT method, url, status, duration_ms, size, created_at FROM app_requests ORDER BY id DESC LIMIT ?").all(limit))
  }
}

function logs() {
  if (!tableExists("process_logs")) {
    console.log("No process logs recorded yet.")
    return
  }
  const filter = args[0]
  if (filter === "errors") {
    const rows = db.query("SELECT process_name, line, created_at FROM process_logs WHERE line LIKE '%error%' OR line LIKE '%Error%' OR line LIKE '%ERROR%' OR line LIKE '%FAIL%' ORDER BY id DESC LIMIT ?").all(limit) as { line: string; created_at: string; process_name: string }[]
    for (const r of rows.reverse()) console.log(`[${r.created_at}] [${r.process_name}] ${r.line}`)
  } else if (filter) {
    const rows = db.query("SELECT line, created_at FROM process_logs WHERE process_name = ? ORDER BY id DESC LIMIT ?").all(filter, limit) as { line: string; created_at: string }[]
    for (const r of rows.reverse()) console.log(`[${r.created_at}] ${r.line}`)
  } else {
    const rows = db.query("SELECT process_name, line, created_at FROM process_logs ORDER BY id DESC LIMIT ?").all(limit) as { line: string; created_at: string; process_name: string }[]
    for (const r of rows.reverse()) console.log(`[${r.created_at}] [${r.process_name}] ${r.line}`)
  }
}

function events() {
  if (!tableExists("process_events")) {
    console.log("No process events recorded yet.")
    return
  }
  const filter = args[0]
  if (filter) {
    console.table(db.query("SELECT process_name, event, exit_code, uptime_seconds, restart_count, created_at FROM process_events WHERE process_name = ? ORDER BY id DESC LIMIT ?").all(filter, limit))
  } else {
    console.table(db.query("SELECT process_name, event, exit_code, uptime_seconds, restart_count, created_at FROM process_events ORDER BY id DESC LIMIT ?").all(limit))
  }
}

function help() {
  console.log(`Usage: dbquery <command> [filter]

Commands:
  requests              Last ${limit} HTTP requests
  requests errors       Only 4xx/5xx responses
  requests slow         Sorted by duration (slowest first)
  logs                  Last ${limit} lines from all processes
  logs webapp           Last ${limit} lines from webapp
  logs errors           Lines containing error/Error/FAIL
  events                All process lifecycle events
  events webapp         Events for webapp only`)
}

switch (command) {
  case "requests": requests(); break
  case "logs": logs(); break
  case "events": events(); break
  default: help(); break
}

db.close()

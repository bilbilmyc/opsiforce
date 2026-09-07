#!/usr/bin/env node
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { execFile } from "node:child_process"

const agentName = process.env.AGENT_NAME || "app-builder"
const workspace = process.env.WORKSPACE || "/workspace"
const agentsRoot = process.env.AGENTS_ROOT || "/opt/agents"
const opencodeRoot = process.env.OPENCODE_ROOT || "/opt/opencode"
const agentRoot = path.join(agentsRoot, agentName)
const agentStateDir = path.join(workspace, ".opsiforce", "agents")
const ledgerPath = path.join(agentStateDir, `${agentName}.json`)
const summaryPath = path.join(agentStateDir, `${agentName}.summary.json`)
const opencodeConfigPath = path.join(workspace, ".opencode", "opencode.json")

const summary = {
  agentName,
  targetVersion: process.env.TARGET_VERSION || "unknown",
  appliedMigrations: [],
  skippedMigrations: [],
  failedMigrations: [],
  conflicts: [],
  requiresPodRecreate: false,
  status: "applied",
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch {
    return fallback
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function loadAgentConfig() {
  const registry = await readJson(path.join(agentsRoot, "agents.json"), {})
  const agents = registry && typeof registry === "object" ? registry.agents : null
  const config = agents && typeof agents === "object" ? agents[agentName] : null
  return config && typeof config === "object" ? config : {}
}

function metadataRequires(agentConfig, key) {
  const workspaceUpdate = agentConfig?.workspaceUpdate
  return !!workspaceUpdate && typeof workspaceUpdate === "object" && workspaceUpdate[key] === true
}

async function modelOverride(agentConfig, currentConfig) {
  if (process.env.AGENT_MODEL) return process.env.AGENT_MODEL
  if (typeof agentConfig?.model === "string") return agentConfig.model
  return typeof currentConfig?.model === "string" ? currentConfig.model : ""
}

function variantOverride(agentConfig, currentConfig) {
  if (process.env.AGENT_VARIANT) return process.env.AGENT_VARIANT
  if (typeof agentConfig?.variant === "string") return agentConfig.variant
  const agent = currentConfig?.agents?.[agentName]
  if (agent && typeof agent === "object") {
    const { variant } = splitModelRef(agent.model)
    if (variant) return variant
  }
  return ""
}

function currentAgentConfig(config) {
  const agent = config?.agents?.[agentName]
  return agent && typeof agent === "object" ? agent : {}
}

function splitModelRef(ref) {
  if (typeof ref !== "string" || !ref) return { model: "", variant: "" }
  const [model, variant = ""] = ref.split("#")
  return { model, variant }
}

function joinModelRef(model, variant) {
  return variant ? `${model}#${variant}` : model
}

async function applyOpenCodeConfig(model, variant) {
  const config = await readJson(opencodeConfigPath, {})
  const next = { ...config, default_agent: agentName }
  if (model) next.model = model
  if (model || variant) {
    next.agents = { ...(next.agents ?? {}) }
    const current = { ...(currentAgentConfig(next) ?? {}) }
    const existing = splitModelRef(current.model)
    current.model = joinModelRef(model || existing.model, variant || existing.variant)
    next.agents[agentName] = current
  }
  await writeJson(opencodeConfigPath, next)
}

async function copyAgentOwnedFiles() {
  const agentConfig = await loadAgentConfig()
  const currentConfig = await readJson(opencodeConfigPath, {})
  const model = await modelOverride(agentConfig, currentConfig)
  const variant = variantOverride(agentConfig, currentConfig)
  await mkdir(path.dirname(opencodeConfigPath), { recursive: true })
  await mkdir(path.join(workspace, ".opencode", "agents"), { recursive: true })
  await cp(path.join(opencodeRoot, "opencode.json"), opencodeConfigPath)
  await applyOpenCodeConfig(model, variant)
  await cp(path.join(agentRoot, "agent.md"), path.join(workspace, ".opencode", "agents", `${agentName}.md`))
  await rm(path.join(workspace, ".opencode", "skills"), { recursive: true, force: true })
  if (await exists(path.join(agentRoot, "skills"))) {
    await cp(path.join(agentRoot, "skills"), path.join(workspace, ".opencode", "skills"), { recursive: true })
  }
}

function recordConflict(migrationId, target, reason) {
  summary.conflicts.push({ migrationId, path: target, reason })
}

async function fileHash(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex")
}

async function checkManagedTarget(target, checksums) {
  const absolute = path.join(workspace, target)
  if (!(await exists(absolute))) return { ok: false, reason: "missing" }
  if (!Array.isArray(checksums) || checksums.length === 0) return { ok: false, reason: "missing managed checksum" }
  const current = await fileHash(absolute)
  if (!checksums.includes(current)) return { ok: false, reason: "checksum mismatch" }
  return { ok: true, reason: "" }
}

function mergeJson(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch
  const source = base && typeof base === "object" && !Array.isArray(base) ? base : {}
  const next = { ...source }
  for (const [key, value] of Object.entries(patch)) {
    next[key] = mergeJson(source[key], value)
  }
  return next
}

async function runShellCommand(operation, migrationDir) {
  const cwd = path.join(workspace, operation.cwd || ".")
  const expand = (value) => String(value).replaceAll("${MIGRATION_DIR}", migrationDir)
  const command = typeof operation.command === "string" ? expand(operation.command) : ""
  if (command.length === 0) throw new Error("migration command is required")
  const args = Array.isArray(operation.args) ? operation.args.map(expand) : []
  await new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      cwd,
      timeout: Number(operation.timeoutSeconds || 300) * 1000,
      env: { ...process.env, MIGRATION_DIR: migrationDir },
    }, (error) => {
      if (error) reject(error)
      else resolve()
    })
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  })
}

async function applyOperation(migrationId, migrationDir, operation) {
  if (!operation || typeof operation !== "object") return
  const target = typeof operation.target === "string" ? operation.target : ""
  const absoluteTarget = path.join(workspace, target)

  if (operation.type === "copy") {
    const source = typeof operation.source === "string" ? path.join(migrationDir, operation.source) : ""
    if (!source || !target) throw new Error(`Invalid copy operation in ${migrationId}`)
    const targetExists = await exists(absoluteTarget)
    if (targetExists && operation.ifMissing) return
    if (targetExists) {
      const check = await checkManagedTarget(target, operation.managedChecksums)
      if (!check.ok) {
        recordConflict(migrationId, target, check.reason)
        return
      }
    }
    await mkdir(path.dirname(absoluteTarget), { recursive: true })
    await cp(source, absoluteTarget, { recursive: true })
    return
  }

  if (operation.type === "delete") {
    const check = await checkManagedTarget(target, operation.managedChecksums)
    if (!check.ok) {
      recordConflict(migrationId, target, check.reason)
      return
    }
    await rm(absoluteTarget, { recursive: true, force: true })
    return
  }

  if (operation.type === "chmod") {
    if (!target || !(await exists(absoluteTarget))) return
    await chmod(absoluteTarget, Number.parseInt(String(operation.mode || "755"), 8))
    return
  }

  if (operation.type === "jsonMerge") {
    const targetExists = await exists(absoluteTarget)
    if (targetExists) {
      const check = await checkManagedTarget(target, operation.managedChecksums)
      if (!check.ok) {
        recordConflict(migrationId, target, check.reason)
        return
      }
    }
    const current = await readJson(absoluteTarget, {})
    await writeJson(absoluteTarget, mergeJson(current, operation.value || {}))
    return
  }

  if (operation.type === "command") {
    await runShellCommand(operation, migrationDir)
  }
}

async function loadMigrations() {
  const root = path.join(agentRoot, "migrations")
  if (!(await exists(root))) return []
  const entries = await readdir(root, { withFileTypes: true })
  const migrations = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    const migration = await readJson(path.join(dir, "migration.json"), undefined)
    if (!migration || typeof migration.id !== "string") continue
    migrations.push({ dir, migration })
  }
  return migrations.sort((a, b) => a.migration.id.localeCompare(b.migration.id))
}

async function applyWorkspaceMigrations(alreadyApplied) {
  for (const item of await loadMigrations()) {
    const migration = item.migration
    if (alreadyApplied.has(migration.id)) {
      summary.skippedMigrations.push(migration.id)
      continue
    }
    const operations = Array.isArray(migration.operations) ? migration.operations : []
    const conflictsBefore = summary.conflicts.length
    try {
      for (const operation of operations) {
        await applyOperation(migration.id, item.dir, operation)
      }
    } catch (error) {
      summary.failedMigrations.push({
        migrationId: migration.id,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
    if (summary.conflicts.length > conflictsBefore) continue
    summary.appliedMigrations.push(migration.id)
    if (migration.requiresPodRecreate) summary.requiresPodRecreate = true
  }
}

async function writeLedger(appliedMigrations) {
  await writeJson(ledgerPath, {
    agentName,
    agentVersion: summary.targetVersion,
    appliedMigrations,
    updatedAt: new Date().toISOString(),
  })
}

async function writeSummaryFile() {
  await writeJson(summaryPath, summary)
}

async function resolveTargetVersion() {
  if (process.env.TARGET_VERSION) return process.env.TARGET_VERSION
  const agentConfig = await loadAgentConfig()
  if (typeof agentConfig.version === "string" && agentConfig.version.length > 0) {
    return agentConfig.version
  }
  return "unknown"
}

async function seedBaseline() {
  summary.targetVersion = await resolveTargetVersion()
  await writeLedger([])
  await writeSummaryFile()
}

async function syncAgentFiles() {
  summary.targetVersion = await resolveTargetVersion()
  await copyAgentOwnedFiles()
  console.log(JSON.stringify(summary))
}

async function main() {
  summary.targetVersion = await resolveTargetVersion()
  const ledger = await readJson(ledgerPath, {})
  const previouslyApplied = Array.isArray(ledger.appliedMigrations) ? ledger.appliedMigrations : []
  const alreadyApplied = new Set(previouslyApplied)

  const agentConfig = await loadAgentConfig()
  summary.requiresPodRecreate = metadataRequires(agentConfig, "requiresPodRecreate")

  await copyAgentOwnedFiles()
  await applyWorkspaceMigrations(alreadyApplied)

  if (summary.conflicts.length > 0) summary.status = "conflict"

  const allApplied = Array.from(new Set([...previouslyApplied, ...summary.appliedMigrations]))
  await writeLedger(allApplied)
  await writeSummaryFile()
  console.log(JSON.stringify(summary))
}

const entrypoint = process.argv.includes("--seed-baseline")
  ? seedBaseline
  : process.argv.includes("--sync-agent-files")
    ? syncAgentFiles
    : main

entrypoint().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error)
  summary.status = "failed"
  summary.error = message
  await writeSummaryFile().catch(() => {})
  console.log(JSON.stringify(summary))
  process.exit(1)
})

#!/usr/bin/env node
import { constants } from "node:fs"
import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const workspace = process.env.WORKSPACE || "/workspace"
const packagePath = path.join(workspace, "app", "package.json")

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function patchScript(scripts, key, from, to) {
  if (scripts[key] !== from) return false
  scripts[key] = to
  return true
}

if (await exists(packagePath)) {
  const current = await readFile(packagePath, "utf8")
  const pkg = JSON.parse(current)
  const scripts = pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts) ? pkg.scripts : {}
  pkg.scripts = scripts

  let changed = false
  changed = patchScript(scripts, "dev:frontend", "yarn vite frontend --host 0.0.0.0", "vite frontend --host 0.0.0.0") || changed
  changed = patchScript(scripts, "dev:backend", "yarn nest start --watch --path backend/tsconfig.json", "nest start --watch --path backend/tsconfig.json") || changed
  changed = patchScript(scripts, "build", "yarn vite build frontend && yarn tsc -p backend/tsconfig.json", "vite build frontend && tsc -p backend/tsconfig.json") || changed
  changed = patchScript(scripts, "check", "yarn tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -20; yarn tsc --noEmit -p backend/tsconfig.json 2>&1 | head -20", "tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -20; tsc --noEmit -p backend/tsconfig.json 2>&1 | head -20") || changed

  if (changed) {
    await writeFile(packagePath, formatJson(pkg))
  }

  process.stdout.write(changed ? "removed inner yarn from app scripts\n" : "app scripts already avoid inner yarn\n")
}

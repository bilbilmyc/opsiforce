#!/usr/bin/env node
import { constants } from "node:fs"
import { access, chmod, readFile, rm, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import path from "node:path"

const workspace = process.env.WORKSPACE || "/workspace"
const appDir = path.join(workspace, "app")
const packagePath = path.join(appDir, "package.json")
const yarnrcPath = path.join(appDir, ".yarnrc.yml")
const startupPath = path.join(appDir, "startup.sh")
const rootGitignorePath = path.join(workspace, ".gitignore")
const appGitignorePath = path.join(appDir, ".gitignore")
const bunLockPath = path.join(appDir, "bun.lock")
const bunLockbPath = path.join(appDir, "bun.lockb")
const bunCacheDir = path.join(workspace, ".xdg", "cache", ".bun")

const yarnrc = `nodeLinker: pnp
pnpMode: strict
pnpEnableEsmLoader: true
pnpFallbackMode: dependencies-only

enableGlobalCache: false
compressionLevel: 0

enableImmutableInstalls: false
`

const startup = `#!/bin/bash
set -e
cd "$(dirname "$0")"

while [ ! -f ".pnp.cjs" ]; do
  sleep 2
done

guard app-backend yarn dev:backend &
guard app-frontend yarn dev:frontend &
wait -n
`

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await readFile(filePath, "utf8")
  } catch {
    return fallback
  }
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function patchScripts(pkg) {
  const scripts = pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts) ? pkg.scripts : {}
  pkg.scripts = {
    ...scripts,
    "dev:frontend": "yarn vite frontend --host 0.0.0.0",
    "dev:backend": "yarn nest start --watch --path backend/tsconfig.json",
    build: "yarn vite build frontend && yarn tsc -p backend/tsconfig.json",
    check: "yarn tsc --noEmit -p frontend/tsconfig.json 2>&1 | head -20; yarn tsc --noEmit -p backend/tsconfig.json 2>&1 | head -20",
  }
}

async function alreadyYarnPnpTemplate() {
  if (!(await exists(packagePath)) || !(await exists(yarnrcPath))) return false
  if (await exists(bunLockPath) || await exists(bunLockbPath)) return false
  const pkg = JSON.parse(await readFile(packagePath, "utf8"))
  return typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("yarn@")
}

async function writePackageJson() {
  if (!(await exists(packagePath))) return false
  const current = await readFile(packagePath, "utf8")
  const pkg = JSON.parse(await readFile(packagePath, "utf8"))
  patchScripts(pkg)
  pkg.dependencies = {
    ...(pkg.dependencies && typeof pkg.dependencies === "object" ? pkg.dependencies : {}),
    "react-is": pkg.dependencies?.["react-is"] || "^19.2.0",
    rxjs: pkg.dependencies?.rxjs || "^7.8.2",
  }
  pkg.packageManager = "yarn@4.12.0"
  pkg.dependenciesMeta = {
    ...(pkg.dependenciesMeta && typeof pkg.dependenciesMeta === "object" ? pkg.dependenciesMeta : {}),
    "@nestjs/core": {
      ...(
        pkg.dependenciesMeta?.["@nestjs/core"] && typeof pkg.dependenciesMeta["@nestjs/core"] === "object"
          ? pkg.dependenciesMeta["@nestjs/core"]
          : {}
      ),
      built: false,
    },
  }
  const next = formatJson(pkg)
  if (next === current) return false
  await writeFile(packagePath, next)
  return true
}

async function writeStartup() {
  const current = await readText(startupPath)
  if (!current.trim()) {
    await writeFile(startupPath, startup)
    await chmod(startupPath, 0o755)
    return
  }

  const next = current
    .replaceAll('"bun.lock"', '".pnp.cjs"')
    .replaceAll('"bun.lockb"', '".pnp.cjs"')
    .replaceAll("'bun.lock'", "'.pnp.cjs'")
    .replaceAll("'bun.lockb'", "'.pnp.cjs'")
    .replaceAll("bun run ", "yarn ")

  await writeFile(startupPath, next === current && !current.includes(".pnp.cjs") ? startup : next)
  await chmod(startupPath, 0o755)
}

async function appendGitignoreEntries(filePath, entries) {
  const current = await readText(filePath)
  const lines = new Set(current.split("\n").map((line) => line.trim()).filter(Boolean))
  const next = [...current.split("\n").filter((line) => line.length > 0)]
  for (const entry of entries) {
    if (lines.has(entry)) continue
    next.push(entry)
  }
  await writeFile(filePath, `${next.join("\n")}\n`)
}

async function runYarnInstall() {
  await new Promise((resolve, reject) => {
    const child = execFile("corepack", ["yarn", "install"], {
      cwd: appDir,
      timeout: 900_000,
      env: process.env,
    }, (error) => {
      if (error) reject(error)
      else resolve()
    })
    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
  })
}

if (await alreadyYarnPnpTemplate()) {
  if (await writePackageJson()) await runYarnInstall()
  await writeStartup()
  process.stdout.write("app package manager already uses yarn pnp\n")
} else if (await exists(packagePath)) {
  const hadBunInstall = (await exists(bunLockPath)) || (await exists(bunLockbPath))
  await writePackageJson()
  await writeFile(yarnrcPath, yarnrc)
  if (hadBunInstall) await runYarnInstall()
  await writeStartup()
  await appendGitignoreEntries(appGitignorePath, [
    ".yarn/cache",
    ".yarn/unplugged",
    ".yarn/build-state.yml",
    ".yarn/install-state.gz",
    ".yarn/sdks",
    ".pnp.*",
  ])
  await appendGitignoreEntries(rootGitignorePath, [
    "**/.yarn/cache",
    "**/.yarn/unplugged",
    "**/.yarn/build-state.yml",
    "**/.yarn/install-state.gz",
    "**/.yarn/sdks",
    "**/.pnp.*",
  ])
  await rm(bunLockPath, { force: true })
  await rm(bunLockbPath, { force: true })
  await rm(bunCacheDir, { recursive: true, force: true })
  await rm(path.join(appDir, "node_modules"), { recursive: true, force: true })
  process.stdout.write(
    hadBunInstall
      ? "app package manager migrated to yarn pnp\n"
      : "app package manager scaffolded for yarn pnp (install deferred until first use)\n",
  )
}

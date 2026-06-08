#!/usr/bin/env node
// Brings pre-existing app workspaces up to date with production publishing:
//   - startup.sh gains the OPSIFORCE_ENV=production branch (install/build/start;
//     no .pnp.cjs wait, no load_app_env)
//   - package.json gains start:backend / start:frontend (drops createDbIfNotExists)
//   - vite.config.ts gains a preview block so `vite preview` serves on APP_PORT
//   - .gitignore ignores opsiforce.env.json and built dist output
// Runs with cwd = /workspace/app. Idempotent — safe to re-run.
import fs from "node:fs"
import path from "node:path"

const appDir = process.cwd()
const changed = []

const STARTUP = `#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ "$OPSIFORCE_ENV" = "production" ]; then
  yarn install --immutable || yarn install
  yarn build
  guard app-backend yarn start:backend &
  guard app-frontend yarn start:frontend &
  wait -n
else
  while [ ! -f ".pnp.cjs" ]; do
    sleep 2
  done

  guard app-backend yarn dev:backend &
  guard app-frontend yarn dev:frontend &
  wait -n
fi
`

function writeStartup() {
  const target = path.join(appDir, "startup.sh")
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : ""
  if (current === STARTUP) return
  fs.writeFileSync(target, STARTUP)
  fs.chmodSync(target, 0o755)
  changed.push("startup.sh")
}

function patchPackageJson() {
  const target = path.join(appDir, "package.json")
  if (!fs.existsSync(target)) return
  const pkg = JSON.parse(fs.readFileSync(target, "utf8"))
  const scripts = pkg.scripts && typeof pkg.scripts === "object" && !Array.isArray(pkg.scripts) ? pkg.scripts : {}
  let touched = false
  if (scripts["start:backend"] !== "yarn node backend/dist/main.js") {
    scripts["start:backend"] = "yarn node backend/dist/main.js"
    touched = true
  }
  if (scripts["start:frontend"] !== "vite preview frontend --host 0.0.0.0") {
    scripts["start:frontend"] = "vite preview frontend --host 0.0.0.0"
    touched = true
  }
  if ("createDbIfNotExists" in scripts) {
    delete scripts["createDbIfNotExists"]
    touched = true
  }
  if (!touched) return
  pkg.scripts = scripts
  fs.writeFileSync(target, `${JSON.stringify(pkg, null, 2)}\n`)
  changed.push("package.json")
}

function patchViteConfig() {
  const target = path.join(appDir, "frontend", "vite.config.ts")
  if (!fs.existsSync(target)) return
  let src = fs.readFileSync(target, "utf8")
  if (/\bpreview\s*:/.test(src)) return
  const block = [
    "  preview: {",
    '    port: parseInt(process.env.APP_PORT || "3000"),',
    "    strictPort: true,",
    '    host: "0.0.0.0",',
    "    proxy: {",
    '      "/api": "http://127.0.0.1:3100",',
    "    },",
    "  },",
    "",
  ].join("\n")
  if (/\n\s*build\s*:\s*\{/.test(src)) {
    src = src.replace(/(\n)(\s*build\s*:\s*\{)/, `\n${block}$2`)
  } else if (/\}\)\s*;?\s*$/.test(src)) {
    src = src.replace(/(\}\)\s*;?\s*)$/, `${block}$1`)
  } else {
    return
  }
  fs.writeFileSync(target, src)
  changed.push("frontend/vite.config.ts")
}

function patchGitignore() {
  const target = path.join(appDir, ".gitignore")
  const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : ""
  const lines = current.split("\n")
  const present = new Set(lines.map((l) => l.trim()))
  const additions = ["opsiforce.env.json", "**/dist"].filter((entry) => !present.has(entry))
  if (additions.length === 0) return
  const body = current.replace(/\n+$/, "")
  fs.writeFileSync(target, `${body}\n${additions.join("\n")}\n`)
  changed.push(".gitignore")
}

writeStartup()
patchPackageJson()
patchViteConfig()
patchGitignore()

console.log(changed.length > 0 ? `production publish support: updated ${changed.join(", ")}` : "production publish support: already current")

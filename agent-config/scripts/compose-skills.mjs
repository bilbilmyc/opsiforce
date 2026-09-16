#!/usr/bin/env node
import { constants } from "node:fs"
import { access, cp, mkdir, readFile, readdir, rename, rm } from "node:fs/promises"
import path from "node:path"

export function planCompose(sharedNames, overrideNames) {
  const overrides = new Set(overrideNames)
  const names = [...new Set([...sharedNames, ...overrideNames])].sort()
  return names.map((name) => ({
    name,
    source: overrides.has(name) ? "override" : "shared",
  }))
}

async function listSkillDirs(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

export async function composeSkills({ sharedDir, overridesDir, outDir, sharedSkills }) {
  const available = await listSkillDirs(sharedDir)
  if (sharedSkills !== undefined && (!Array.isArray(sharedSkills) || sharedSkills.some(name => !available.includes(name)))) {
    throw new Error("sharedSkills must list existing shared skills")
  }
  const plan = planCompose(sharedSkills ?? available, await listSkillDirs(overridesDir))
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })
  for (const { name, source } of plan) {
    const from = path.join(source === "override" ? overridesDir : sharedDir, name)
    await cp(from, path.join(outDir, name), { recursive: true, dereference: true })
  }
  return plan
}

async function exists(target) {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function composeAgentsRoot(sharedDir, agentsRoot) {
  const registry = JSON.parse(await readFile(path.join(agentsRoot, "agents.json"), "utf8"))
  for (const entry of await readdir(agentsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillsDir = path.join(agentsRoot, entry.name, "skills")
    const stagingDir = path.join(agentsRoot, entry.name, ".skills-composed")
    const plan = await composeSkills({ sharedDir, overridesDir: skillsDir, outDir: stagingDir,
      sharedSkills: registry.agents?.[entry.name]?.sharedSkills })
    if (await exists(skillsDir)) await rm(skillsDir, { recursive: true, force: true })
    await rename(stagingDir, skillsDir)
    console.log(`${entry.name}: composed ${plan.length} skills (${plan.filter((s) => s.source === "override").length} override)`)
  }
}

async function main() {
  const [sharedDir, agentsRoot] = process.argv.slice(2)
  if (!sharedDir || !agentsRoot) {
    console.error("usage: compose-skills.mjs <sharedDir> <agentsRoot>")
    process.exit(1)
  }
  await composeAgentsRoot(sharedDir, agentsRoot)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

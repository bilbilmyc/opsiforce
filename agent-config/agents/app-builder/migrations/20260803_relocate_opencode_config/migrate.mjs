#!/usr/bin/env node
import { constants } from "node:fs"
import { access, rm } from "node:fs/promises"
import path from "node:path"

const workspace = process.env.WORKSPACE || "/workspace"
const legacyConfigPath = path.join(workspace, ".xdg", "config", "opencode", "opencode.json")

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

if (await exists(legacyConfigPath)) {
  await rm(legacyConfigPath, { force: true })
  process.stdout.write("removed legacy opencode config from the XDG location\n")
} else {
  process.stdout.write("legacy opencode config already absent\n")
}

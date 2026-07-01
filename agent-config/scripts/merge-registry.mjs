#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises"

export function mergeRegistries(publicRegistry, privateFragment) {
  return { agents: { ...(publicRegistry?.agents ?? {}), ...(privateFragment?.agents ?? {}) } }
}

async function readRegistry(filePath) {
  if (!filePath) return { agents: {} }
  try {
    const parsed = JSON.parse(await readFile(filePath, "utf8"))
    return parsed && typeof parsed === "object" ? parsed : { agents: {} }
  } catch {
    return { agents: {} }
  }
}

async function main() {
  const [publicPath, privatePath, outPath] = process.argv.slice(2)
  if (!publicPath || !privatePath || !outPath) {
    console.error("usage: merge-registry.mjs <publicRegistry> <privateFragment> <out>")
    process.exit(1)
  }
  const merged = mergeRegistries(await readRegistry(publicPath), await readRegistry(privatePath))
  await writeFile(outPath, `${JSON.stringify(merged, null, 2)}\n`)
  console.log(`merged registry: ${Object.keys(merged.agents).length} agent(s) -> ${outPath}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}

import { readFileSync } from "node:fs"
import { join } from "node:path"

interface AgentConfigEntry {
  poolSize?: number
  version?: string
  model?: string
  description?: string
}

interface AgentsConfigFile {
  agents?: Record<string, AgentConfigEntry>
}

export interface AgentRuntimeConfig {
  poolSizes: Map<string, number>
  versions: Map<string, string>
  models: Map<string, string>
  descriptions: Map<string, string>
}

export function readAgentConfig(): AgentRuntimeConfig {
  const file = join(process.cwd(), "..", "agent-config", "agents.json")
  const poolSizes = new Map<string, number>()
  const versions = new Map<string, string>()
  const models = new Map<string, string>()
  const descriptions = new Map<string, string>()
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as AgentsConfigFile
    for (const [name, conf] of Object.entries(parsed.agents ?? {})) {
      const poolSize = typeof conf.poolSize === "number" && conf.poolSize > 0 ? conf.poolSize : 0
      poolSizes.set(name, poolSize)
      if (typeof conf.version === "string" && conf.version.length > 0) {
        versions.set(name, conf.version)
      }
      if (typeof conf.model === "string" && conf.model.length > 0) {
        models.set(name, conf.model)
      }
      if (typeof conf.description === "string" && conf.description.length > 0) {
        descriptions.set(name, conf.description)
      }
    }
  } catch {
    return { poolSizes, versions, models, descriptions }
  }
  return { poolSizes, versions, models, descriptions }
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AgentRegistryEntry {
  name?: string;
  description?: string;
  default?: boolean;
  port?: number;
  version?: string;
  model?: string;
  variant?: string;
  poolSize?: number;
}

export interface AgentRegistry {
  agents: Record<string, AgentRegistryEntry>;
}

export interface AgentModelSelection {
  model: string;
  variant?: string;
}

export interface AgentRuntimeConfig {
  poolSizes: Map<string, number>;
  versions: Map<string, string>;
  modelSelections: Map<string, AgentModelSelection>;
}

function readPublicRegistry(): AgentRegistry {
  const file = join(process.cwd(), '..', 'agent-config', 'agents.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AgentRegistry>;
    return { agents: parsed.agents ?? {} };
  } catch {
    return { agents: {} };
  }
}

function readPrivateRegistry(): AgentRegistry {
  const file = join(process.cwd(), '..', 'agent-config', 'private', 'agents.json');
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AgentRegistry>;
    return { agents: parsed.agents ?? {} };
  } catch {
    return { agents: {} };
  }
}

export function mergeAgentRegistries(publicRegistry: AgentRegistry, privateFragment?: AgentRegistry): AgentRegistry {
  return { agents: { ...publicRegistry.agents, ...privateFragment?.agents } };
}

export function readMergedAgentRegistry(privateFragment?: AgentRegistry): AgentRegistry {
  return mergeAgentRegistries(readPublicRegistry(), privateFragment ?? readPrivateRegistry());
}

export function readAgentConfig(): AgentRuntimeConfig {
  const poolSizes = new Map<string, number>();
  const versions = new Map<string, string>();
  const modelSelections = new Map<string, AgentModelSelection>();
  for (const [slug, conf] of Object.entries(readMergedAgentRegistry().agents)) {
    const poolSize = typeof conf.poolSize === 'number' && conf.poolSize > 0 ? conf.poolSize : 0;
    poolSizes.set(slug, poolSize);
    if (typeof conf.version === 'string' && conf.version.length > 0) {
      versions.set(slug, conf.version);
    }
    if (typeof conf.model === 'string' && conf.model.length > 0) {
      modelSelections.set(slug, {
        model: conf.model,
        ...(typeof conf.variant === 'string' && conf.variant.length > 0 ? { variant: conf.variant } : {}),
      });
    }
  }
  return { poolSizes, versions, modelSelections };
}

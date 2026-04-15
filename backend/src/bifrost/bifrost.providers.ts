import type { KeyType, BifrostProviderConfig } from "./bifrost.types"

export const BIFROST_PROVIDER_CONFIGS: Record<KeyType, BifrostProviderConfig[]> = {
  chat: [
    { provider: "openai", weight: 0 },
    { provider: "anthropic", weight: 1 },
    { provider: "custom-openai-1", weight: 0.3 },
    { provider: "custom-openai-2", weight: 0.3 },
    { provider: "custom-openai-3", weight: 0.3 },
  ],
  backend: [
    { provider: "openai", weight: 1 },
    { provider: "anthropic", weight: 1 },
  ],
}

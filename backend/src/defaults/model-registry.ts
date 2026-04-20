export interface ModelOption {
  value: string
  label: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { value: "openai/gpt-5.4", label: "GPT-5.4" },
  { value: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "openai/gpt-5.3-codex", label: "GPT-5.3 Codex" },
  { value: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
]

export function isValidModel(value: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.value === value)
}

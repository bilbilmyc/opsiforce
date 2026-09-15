import type { Model } from '@opencode-ai/schema/model'

export class GenerationBudgetError extends Error {
  constructor(readonly kind: 'capability' | 'context', message: string) { super(message) }
}

/** A conservative text estimate, not a model tokenizer. Include tool schemas and system text. */
export function estimateRequestTokens(value: unknown) {
  return Math.ceil(new TextEncoder().encode(JSON.stringify(value)).byteLength / 2) + 128
}

export function generationBudget(limit: Model.Info['limit'], policy: NonNullable<Model.Info['generationPolicy']>, inputTokens: number) {
  if (!policy.ready || limit.context <= 0 || limit.output <= 0 || policy.outputBudget <= 0)
    throw new GenerationBudgetError('capability', '此渠道模型的能力信息未配置完整，请管理员在模型设置中补齐上下文、输出上限及工具/思考能力。')
  const margin = Math.max(512, Math.ceil(limit.context * 0.05))
  const remaining = limit.context - inputTokens - margin - policy.reasoningReserve
  if ((limit.input !== undefined && inputTokens + margin > limit.input) || remaining < Math.min(1024, limit.output))
    throw new GenerationBudgetError('context', '当前模型的可用上下文不足。请压缩历史、减少输入，或选择上下文更大的模型。')
  return Math.min(policy.outputBudget, limit.output, remaining)
}

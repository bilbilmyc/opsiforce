import type { ChannelModel } from './bifrost.catalog';

const fieldLabels: Record<string, string> = {
  context: '上下文总容量', maxInput: '最大输入长度', maxOutput: '最大回答长度', outputBudget: '每次输出预算', reasoningBudget: '思考预留长度', tools: '工具调用', streaming: '流式输出', vision: '图片输入', reasoningAccounting: '思考额度规则', reasoningEfforts: '支持的思考强度', reasoningEffort: '默认思考强度', maxTokensField: '输出参数格式', source: '配置依据',
};

export interface ModelPolicy {
  context?: number;
  maxInput?: number;
  maxOutput?: number;
  outputBudget?: number;
  tools?: boolean;
  vision?: boolean;
  streaming?: boolean;
  reasoningAccounting?: 'shared' | 'separate' | 'none' | 'unknown';
  reasoningEfforts?: string[];
  reasoningEffort?: string;
  reasoningBudget?: number;
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  source?: string;
}

export function validateModelPolicy(value: unknown): ModelPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('模型能力必须是对象');
  const p = value as Record<string, unknown>;
  const numeric = ['context', 'maxInput', 'maxOutput', 'outputBudget', 'reasoningBudget'];
  const allowed = [...numeric, 'tools', 'vision', 'streaming', 'reasoningAccounting', 'reasoningEfforts', 'reasoningEffort', 'maxTokensField', 'source'];
  for (const k of Object.keys(p)) if (!allowed.includes(k)) throw new Error(`不支持的能力字段：${k}`);
  for (const k of numeric) if (p[k] !== undefined && (!Number.isSafeInteger(p[k]) || Number(p[k]) < 1 || Number(p[k]) > 100_000_000)) throw new Error(`${fieldLabels[k] ?? k}必须是正整数`);
  for (const k of ['tools', 'vision', 'streaming']) if (p[k] !== undefined && typeof p[k] !== 'boolean') throw new Error(`${fieldLabels[k] ?? k}必须选择支持或不支持`);
  if (p.reasoningAccounting !== undefined && !['shared', 'separate', 'none', 'unknown'].includes(String(p.reasoningAccounting))) throw new Error('思考预算规则无效');
  if (p.maxTokensField !== undefined && !['max_tokens', 'max_completion_tokens'].includes(String(p.maxTokensField))) throw new Error('输出参数字段无效');
  if (p.reasoningEfforts !== undefined && (!Array.isArray(p.reasoningEfforts) || p.reasoningEfforts.length > 12 || !p.reasoningEfforts.every(x => typeof x === 'string' && x !== 'default' && /^[a-z][a-z0-9_-]{0,30}$/.test(x)))) throw new Error('思考强度列表无效');
  if (p.reasoningEffort !== undefined && (!Array.isArray(p.reasoningEfforts) || !p.reasoningEfforts.includes(p.reasoningEffort))) throw new Error('所选思考强度不在支持列表中');
  if (p.source !== undefined && (typeof p.source !== 'string' || p.source.length > 1000)) throw new Error('来源说明不能超过 1000 字符');
  if (p.context && p.maxInput && Number(p.maxInput) > Number(p.context)) throw new Error('输入上限不能大于上下文窗口');
  if (p.context && p.maxOutput && Number(p.maxOutput) > Number(p.context)) throw new Error('输出上限不能大于上下文窗口');
  if (p.reasoningBudget && p.reasoningAccounting !== 'separate') throw new Error('思考预留长度仅适用于独立思考模式');
  return { ...p } as ModelPolicy;
}

export type RuntimePolicy = Pick<ModelPolicy, 'outputBudget' | 'reasoningEffort' | 'reasoningBudget'>;
export const capabilityKeys = ['context', 'maxInput', 'maxOutput', 'tools', 'vision', 'streaming', 'reasoningAccounting', 'reasoningEfforts', 'maxTokensField', 'source'] as const;
const runtimeKeys = ['outputBudget', 'reasoningEffort', 'reasoningBudget'] as const;

export function validateRuntimePolicy(value: unknown): RuntimePolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('运行策略必须是对象');
  for (const key of Object.keys(value)) {
    if (!(runtimeKeys as readonly string[]).includes(key)) throw new Error(`模型能力由 Bifrost 管理，运行策略不接受字段：${key}`);
  }
  const policy = value as RuntimePolicy;
  for (const key of ['outputBudget', 'reasoningBudget'] as const) {
    const v = policy[key];
    if (v !== undefined && (!Number.isSafeInteger(v) || v < 1 || v > 100_000_000)) throw new Error(`${fieldLabels[key] ?? key}必须是正整数`);
  }
  if (policy.reasoningEffort !== undefined && (typeof policy.reasoningEffort !== 'string' || !/^[a-z][a-z0-9_-]{0,30}$/.test(policy.reasoningEffort) || policy.reasoningEffort === 'default')) throw new Error('默认思考强度无效');
  return { ...policy };
}

export function resolveModelPolicy(model: ChannelModel, runtime: RuntimePolicy = {}) {
  const sources: Record<string, 'gateway' | 'gateway-attribute' | 'policy'> = {};
  const limits: ModelPolicy = {};
  const errors: string[] = [];
  for (const [key, raw] of Object.entries({ context: model.context_length, maxInput: model.max_input_tokens, maxOutput: model.max_output_tokens, tools: model.supports_function_calling, streaming: model.supports_streaming, vision: model.supports_vision })) {
    if ((typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0) || typeof raw === 'boolean') {
      Object.assign(limits, { [key]: raw }); sources[key] = 'gateway';
    }
  }
  // Bifrost's editable attributes are strings. Namespaced facts take precedence
  // over its public datasheet, allowing an operator to describe a channel limit.
  for (const key of capabilityKeys) {
    const raw = model.additional_attributes?.[`opsiforce.${key}`];
    if (raw === undefined) continue;
    sources[key] = 'gateway-attribute';
    try {
      if (typeof raw !== 'string' || !raw.trim()) throw new Error('属性不能为空');
      const value = ['context', 'maxInput', 'maxOutput', 'tools', 'vision', 'streaming', 'reasoningEfforts'].includes(key) ? JSON.parse(raw) : raw;
      if (value === null) throw new Error('属性不能为 null');
      validateModelPolicy({ [key]: value });
      Object.assign(limits, { [key]: value });
    } catch { errors.push(`Bifrost 的“${fieldLabels[key] ?? key}”配置格式无效，请在模型配置表单中修正`); }
  }
  // Explicitly ignore legacy local capability fields, even if an old row is supplied.
  for (const key of runtimeKeys) if (runtime[key] !== undefined) {
    Object.assign(limits, { [key]: runtime[key] }); sources[key] = 'policy';
  }
  if (limits.reasoningAccounting === 'none') {
    delete limits.reasoningEffort; delete limits.reasoningBudget; limits.reasoningEfforts = [];
  }
  const missing = ['context', 'maxOutput'].filter(k => !limits[k as keyof ModelPolicy]);
  try { validateModelPolicy(limits); } catch (error) { errors.push((error as Error).message); }
  if (limits.tools === false) errors.push('模型不支持工具调用');
  if (limits.streaming === false) errors.push('模型不支持流式输出');
  if (limits.tools === undefined) missing.push('tools');
  if (limits.streaming === undefined) missing.push('streaming');
  if (!limits.reasoningAccounting || limits.reasoningAccounting === 'unknown') missing.push('reasoningAccounting');
  if (limits.reasoningAccounting === 'separate' && !limits.reasoningBudget) missing.push('reasoningBudget');
  const outputBudget = limits.maxOutput ? Math.min(limits.outputBudget ?? 32768, limits.maxOutput) : undefined;
  if (!sources.outputBudget) sources.outputBudget = 'policy';
  return { ...limits, outputBudget, sources, missing, errors, ready: missing.length === 0 && errors.length === 0 };
}

export function preserveModelSelection(current: string | undefined, _available: string[], fallback: string) {
  // A removed model must surface as unavailable rather than silently changing provider.
  return current || fallback;
}

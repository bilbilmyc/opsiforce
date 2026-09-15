import { resolveModelPolicy, type ModelPolicy } from './model-policy';

export interface Channel {
  name: string;
  provider_status?: string;
  custom_provider_config?: { is_key_less?: boolean; base_provider_type?: string; allowed_requests?: Record<string, boolean> };
}
export interface ChannelKey {
  enabled?: boolean;
  value?: { value?: string };
  models?: string[];
  blacklisted_models?: string[];
  aliases?: Record<string, string>;
}
export interface ChannelModel {
  additional_attributes?: Record<string, string>;
  provider: string;
  name: string;
  context_length?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  supports_function_calling?: boolean;
  supports_streaming?: boolean;
  supports_vision?: boolean;
  policy?: ModelPolicy;
}

// Preserve the exact channel ID, including case and model names containing slashes.
export function availableModels(channels: Array<Channel & { keys: ChannelKey[] }>, models: ChannelModel[]): ChannelModel[] {
  const result = new Map<string, ChannelModel>();
  for (const channel of channels) {
    if (channel.provider_status && channel.provider_status !== 'active') continue;
    const requests = channel.custom_provider_config?.allowed_requests;
    if (requests && (requests.chat_completion === false || requests.chat_completion_stream === false)) continue;
    const keys = channel.keys.filter(k => k.enabled !== false && !!k.value?.value);
    const keyless = channel.custom_provider_config?.is_key_less === true;
    const candidates = new Set(models.filter(m => m.provider === channel.name).map(m => m.name));
    for (const key of keys) {
      for (const name of key.models ?? []) if (name !== '*') candidates.add(name);
      for (const name of Object.keys(key.aliases ?? {})) candidates.add(name);
    }
    for (const name of candidates) {
      const allowed = keyless || keys.some(k =>
        !k.blacklisted_models?.includes(name) &&
        (!k.models?.length || k.models.includes('*') || k.models.includes(name) || !!k.aliases?.[name])
      );
      if (allowed) result.set(`${channel.name}/${name}`, { ...models.find(m => m.provider === channel.name && m.name === name), provider: channel.name, name });
    }
  }
  return [...result.values()].toSorted((a, b) => `${a.provider}/${a.name}`.localeCompare(`${b.provider}/${b.name}`));
}

export function providerGrants(models: ChannelModel[]) {
  return [...new Set(models.map(m => m.provider))].map(provider => ({
    provider, weight: 1, allowed_models: models.filter(m => m.provider === provider).map(m => m.name), key_ids: ['*'],
  }));
}

export function runtimeModelConfig(models: ChannelModel[], selected: string | null) {
  const model = models.some(m => `${m.provider}/${m.name}` === selected) ? selected! : models[0] && `${models[0].provider}/${models[0].name}`;
  if (!model) throw new Error('Bifrost 尚无可用聊天模型，请先配置启用的渠道 Key 和模型。');
  const providers: Record<string, unknown> = {};
  for (const provider of new Set(models.map(m => m.provider))) {
    providers[provider] = {
      name: provider,
      package: '@opencode-ai/ai/providers/openai-compatible',
      env: ['OPENAI_API_KEY'],
      settings: { baseURL: '{env:OPENAI_BASE_URL}' },
      models: Object.fromEntries(models.filter(m => m.provider === provider).map(m => {
        const p = resolveModelPolicy(m, m.policy);
        return [m.name, {
        name: m.name, modelID: `${provider}/${m.name}`,
        capabilities: { tools: p.tools ?? false, input: p.vision ? ['text', 'image'] : ['text'], output: ['text'] },
        // OpenCode adds the default choice itself; only additional variants belong here.
        variants: (p.reasoningEfforts ?? []).map(id => ({ id, body: { reasoning_effort: id } })),
        ...(p.reasoningEffort ? { body: { reasoning_effort: p.reasoningEffort } } : {}),
        compatibility: { maxTokensField: p.maxTokensField ?? 'max_tokens' },
        limit: { context: p.context ?? 0, output: p.maxOutput ?? 0, ...(p.maxInput ? { input: p.maxInput } : {}) },
        generationPolicy: { ready: p.ready, outputBudget: p.outputBudget ?? 0, reasoningReserve: p.reasoningAccounting === 'separate' ? p.reasoningBudget ?? 0 : 0 },
      }]; })),
    };
  }
  return { model, providers, plugins: ['-opencode.models.dev', '-opencode.provider.openai', '-opencode.provider.anthropic', '-opencode.provider.opencode'] };
}

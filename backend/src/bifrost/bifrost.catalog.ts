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
  provider: string;
  name: string;
  context_length?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
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

function modelLimits(model: ChannelModel) {
  const positive = (value: number | undefined) => Number.isSafeInteger(value) && value! > 0 ? value : undefined;
  // Deployment owner confirmed the GLM 5.3 family has a 1M context window.
  // Prefer gateway metadata whenever supplied; never invent an output ceiling.
  const context = positive(model.context_length) ?? (/^glm-5\.3(?:-flash)?$/i.test(model.name) ? 1_000_000 : undefined);
  const input = positive(model.max_input_tokens);
  const output = positive(model.max_output_tokens);
  if (context === undefined && input === undefined && output === undefined) return {};
  return { limit: { ...(context ? { context } : {}), ...(input ? { input } : {}), ...(output ? { output } : {}) } };
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
      models: Object.fromEntries(models.filter(m => m.provider === provider).map(m => [m.name, {
        name: m.name, modelID: `${provider}/${m.name}`,
        capabilities: { tools: true, input: ['text'], output: ['text'] },
        variants: [{ id: 'default' }],
        ...modelLimits(m),
      }])),
    };
  }
  return { model, providers, plugins: ['-opencode.models.dev', '-opencode.provider.openai', '-opencode.provider.anthropic', '-opencode.provider.opencode'] };
}

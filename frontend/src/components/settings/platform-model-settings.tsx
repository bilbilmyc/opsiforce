import { createEffect, createResource, createSignal, For, Show } from 'solid-js';
import { api } from '~/api/client';
import { Button } from '~/components/ui/button';

type Policy = { context?: number; maxInput?: number; maxOutput?: number; outputBudget?: number; tools?: boolean; vision?: boolean; streaming?: boolean; reasoningAccounting?: string; reasoningEfforts?: string[]; reasoningEffort?: string; reasoningBudget?: number; maxTokensField?: string; source?: string };
type CatalogModel = { provider: string; name: string; policy?: Policy; effective?: Policy & { ready: boolean; missing: string[]; errors: string[]; sources: Record<string, string> }; policyUpdatedAt?: string | null };
type Catalog = { models: CatalogModel[]; defaultModel: string | null; consoleUrl: string | null };

export function PlatformModelSettings() {
  const [catalog, { mutate, refetch }] = createResource(() => api.get<Catalog>('/models'));
  const [selected, setSelected] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal('');
  const [editing, setEditing] = createSignal('');
  const [draft, setDraft] = createSignal<Record<string, string>>({});
  const editedModel = () => catalog()?.models.find(m => JSON.stringify([m.provider, m.name]) === editing());
  const labels: Record<string, string> = { context: '上下文总容量', maxInput: '最大输入长度', maxOutput: '最大回答长度', tools: '工具调用', streaming: '流式输出', vision: '图片输入', reasoningAccounting: '思考模式', reasoningBudget: '思考预留长度' };
  const display = (key: string, value: unknown) => {
    if (value === undefined) return '未提供';
    if (typeof value === 'boolean') return value ? '支持' : '不支持';
    const words: Record<string, string> = { shared: '思考与回答共用额度', separate: '独立思考额度', none: '关闭', unknown: '待确认', minimal: '最低', low: '低', medium: '中', high: '高', max: '最高', xhigh: '极高', max_tokens: '标准兼容格式', max_completion_tokens: '新版兼容格式' };
    if (Array.isArray(value)) return value.length ? value.map(v => words[String(v)] ?? String(v)).join('、') : '跟随模型默认行为';
    return words[String(value)] ?? String(value);
  };
  const fields = [
    ['outputBudget', '每次输出预算'], ['reasoningBudget', '思考预留长度（仅独立思考模式）'],
  ];
  createEffect(() => {
    const policy = { ...editedModel()?.policy };
    if (editedModel()?.effective?.reasoningAccounting === 'none') { delete policy.reasoningEffort; delete policy.reasoningBudget; }
    setDraft(Object.fromEntries(Object.entries(policy).filter(([k]) => ['outputBudget', 'reasoningBudget', 'reasoningEffort'].includes(k)).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)])));
  });
  const change = (key: string, value: string) => setDraft(d => ({ ...d, [key]: value }));
  async function saveRuntimePolicy() {
    const model = editedModel();
    if (!model) return;
    setBusy(true); setMessage('');
    try {
      const policy: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(draft())) {
        if (!value.trim()) continue;
        policy[key] = fields.some(([k]) => k === key) ? Number(value)
          : value.trim();
      }
      mutate(await api.put<Catalog>('/models/runtime-policy', { provider: model.provider, model: model.name, policy }));
      setMessage('运行策略已保存并同步，下一次模型请求生效。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }

  async function run(save: boolean) {
    setBusy(true);
    setMessage('');
    try {
      mutate(await (save
        ? api.put<Catalog>('/models/default', { model: selected() || catalog()?.defaultModel })
        : api.post<Catalog>('/models/refresh')));
      setSelected('');
      setMessage(save ? '平台默认模型已保存。已有对话单独选择的模型保持不变。' : '渠道模型已刷新。');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '模型同步失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="mb-6 rounded-lg border border-border p-4 space-y-3" aria-labelledby="platform-model-title">
      <h2 id="platform-model-title" class="text-sm font-medium">平台默认模型</h2>
      <p class="text-xs text-muted-foreground">
        用于未单独选择模型的对话。切换当前对话的模型，请使用聊天输入框旁的选择器。
        渠道和模型由 Bifrost 管理，每 30 秒自动同步。
      </p>
      <Show when={!catalog.error} fallback={<Button variant="outline" size="sm" onClick={() => void refetch()}>加载失败，点击重试</Button>}>
        <label class="block text-xs text-muted-foreground" for="platform-default-model">默认渠道与模型</label>
        <select id="platform-default-model" class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={selected() || catalog()?.defaultModel || ''} disabled={busy() || catalog.loading}
          onChange={e => setSelected(e.currentTarget.value)}>
          <Show when={!catalog()?.models.length}><option value="">{catalog.loading ? '正在加载模型…' : '请先在 Bifrost 配置渠道和模型'}</option></Show>
          <For each={catalog()?.models}>{m => <option selected={(selected() || catalog()?.defaultModel) === `${m.provider}/${m.name}`} value={`${m.provider}/${m.name}`}>{m.provider} / {m.name}</option>}</For>
        </select>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy()} onClick={() => void run(false)}>刷新渠道</Button>
        <Button size="sm" disabled={busy() || !selected() || selected() === catalog()?.defaultModel} onClick={() => void run(true)}>
          保存默认模型
        </Button>
      </div>
      <Show when={message()}><p role="status" class="text-xs text-muted-foreground">{message()}</p></Show>
      <details class="border-t border-border pt-3">
        <summary class="cursor-pointer text-sm font-medium">模型能力与运行策略</summary>
        <p class="my-3 text-xs text-muted-foreground">模型能力统一从 Bifrost 读取。此处只设置 智能体的输出预算和默认思考强度，留空使用运行默认值。</p>
        <Show when={catalog()?.consoleUrl}>{url => <a class="block mb-3 text-sm underline" href={url()} target="_blank" rel="noopener noreferrer">打开 Bifrost 模型管理 ↗</a>}</Show>
        <label for="capability-model" class="text-xs">渠道与模型</label>
        <select id="capability-model" class="mt-1 w-full rounded border border-input bg-background p-2 text-sm" value={editing()} onChange={e => setEditing(e.currentTarget.value)}>
          <option value="" selected={!editing()}>选择要配置的模型</option>
          <For each={catalog()?.models}>{m => <option selected={editing() === JSON.stringify([m.provider, m.name])} value={JSON.stringify([m.provider, m.name])}>{m.provider} / {m.name} · {m.effective?.ready ? '已就绪' : '待检查'}</option>}</For>
        </select>
        <Show when={editedModel()}>{m => <div class="mt-3 space-y-3">
          <p class="text-xs" role="status">{m().effective?.ready ? '可用于智能体任务' : `需要补齐：${m().effective?.missing.map(k => labels[k] ?? k).join('、') || '能力未知'}`} {m().effective?.errors.join('；')}</p>
          <h3 class="text-sm font-medium">Bifrost 模型能力（只读）</h3>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded border border-border p-3 text-xs">
            <For each={[
              ['context', '上下文窗口'], ['maxInput', '最大输入'], ['maxOutput', '最大输出'], ['tools', '工具调用'], ['streaming', '流式输出'], ['vision', '图片输入'],
              ['reasoningAccounting', '思考额度规则'], ['reasoningEfforts', '支持的思考强度'], ['maxTokensField', '输出参数字段'], ['source', '能力来源说明'],
            ]}>{([key, label]) => <div><dt class="text-muted-foreground">{label}</dt><dd class="mt-1 break-words">{display(key, m().effective?.[key as keyof Policy])} · {m().effective?.sources[key] === 'gateway-attribute' ? 'Bifrost 自定义属性' : m().effective?.sources[key] === 'gateway' ? 'Bifrost 目录' : '未提供'}</dd></div>}</For>
          </dl>
          <h3 class="text-sm font-medium">智能体运行策略</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <For each={fields}>{([key, label]) => <label class="text-xs">{label}
              <input aria-label={label} type="number" min="1" step="1" class="mt-1 w-full rounded border border-input bg-background p-2" value={draft()[key] ?? ''} placeholder={display(key, m().effective?.[key as keyof Policy])} onInput={e => change(key, e.currentTarget.value)} />
              <span class="block mt-1 text-muted-foreground">当前：{display(key, m().effective?.[key as keyof Policy])} · {m().effective?.sources[key] === 'gateway' ? '网关' : m().effective?.sources[key] === 'policy' ? '运行策略' : '未提供'}</span>
            </label>}</For>
            <label class="text-xs">默认思考强度<select disabled={m().effective?.reasoningAccounting === 'none'} aria-label="默认思考强度" class="mt-1 w-full rounded border border-input bg-background p-2" value={draft().reasoningEffort ?? ''} onChange={e => change('reasoningEffort', e.currentTarget.value)}><option selected={!draft().reasoningEffort} value="">使用渠道默认值</option><For each={m().effective?.reasoningEfforts ?? []}>{v => <option selected={draft().reasoningEffort === v} value={v}>{display('reasoningEffort', v)}</option>}</For><Show when={draft().reasoningEffort && !m().effective?.reasoningEfforts?.includes(draft().reasoningEffort)}><option selected value={draft().reasoningEffort}>{display('reasoningEffort', draft().reasoningEffort)}（Bifrost 已不支持，请重新选择）</option></Show></select></label>
          </div>
          <div class="flex justify-end"><Button size="sm" disabled={busy()} onClick={() => void saveRuntimePolicy()}>保存运行策略</Button></div>
        </div>}</Show>
      </details>
    </section>
  );
}

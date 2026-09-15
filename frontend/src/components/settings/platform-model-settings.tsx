import { t, locale } from '~/i18n';
import { createEffect, createResource, createSignal, For, Show } from 'solid-js';
import { api } from '~/api/client';
import { Button } from '~/components/ui/button';
import { ChannelModelPicker } from './channel-model-picker';

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
  const labels: Record<string, string> = { get context() { return t("上下文总容量"); }, get maxInput() { return t("最大输入长度"); }, get maxOutput() { return t("最大回答长度"); }, get tools() { return t("工具调用"); }, get streaming() { return t("流式输出"); }, get vision() { return t("图片输入"); }, get reasoningAccounting() { return t("思考模式"); }, get reasoningBudget() { return t("思考预留长度"); } };
  const display = (key: string, value: unknown) => {
    if (value === undefined) return t("未提供");
    if (typeof value === 'boolean') return value ? t("支持") : t("不支持");
    const words: Record<string, string> = { get shared() { return t("思考与回答共用额度"); }, get separate() { return t("独立思考额度"); }, get none() { return t("关闭"); }, get unknown() { return t("待确认"); }, get minimal() { return t("最低"); }, get low() { return t("低"); }, get medium() { return t("中"); }, get high() { return t("高"); }, get max() { return t("最高"); }, get xhigh() { return t("极高"); }, get max_tokens() { return t("标准兼容格式"); }, get max_completion_tokens() { return t("新版兼容格式"); } };
    if (Array.isArray(value)) return value.length ? value.map(v => words[String(v)] ?? String(v)).join(locale() === 'zh-CN' ? '、' : ', ') : t("跟随模型默认行为");
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
      setMessage(t("运行策略已保存并同步，下一次模型请求生效。"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("保存失败")); }
    finally { setBusy(false); }
  }

  async function run(save: boolean) {
    setBusy(true);
    setMessage('');
    try {
      mutate(await (save
        ? api.put<Catalog>('/models/default', { model: selected() || catalog()?.defaultModel })
        : api.post<Catalog>('/models/refresh')));
      if (save) setSelected('');
      setMessage(save ? t("平台默认模型已保存。已有对话单独选择的模型保持不变。") : t("渠道模型已刷新。"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("模型同步失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="mb-6 rounded-lg border border-border p-4 space-y-3" aria-labelledby="platform-model-title">
      <h2 id="platform-model-title" class="text-sm font-medium">{t("平台默认模型")}</h2>
      <p class="text-xs text-muted-foreground">{t("用于未单独选择模型的对话。切换当前对话的模型，请使用聊天输入框旁的选择器。 渠道和模型由 Bifrost 管理，每 30 秒自动同步。")}</p>
      <Show when={!catalog.error} fallback={<Button variant="outline" size="sm" onClick={() => void refetch()}>{t("加载失败，点击重试")}</Button>}>
        <ChannelModelPicker id="platform-default" models={catalog()?.models ?? []}
          value={catalog()?.models.find(m => `${m.provider}/${m.name}` === (selected() || catalog()?.defaultModel))}
          disabled={busy()} loading={catalog.loading}
          onChange={model => setSelected(`${model.provider}/${model.name}`)} />
        <Show when={selected() && selected() !== catalog()?.defaultModel}><p class="text-xs text-muted-foreground">{t("选择尚未保存，点击「保存默认模型」后生效。")}</p></Show>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy()} onClick={() => void run(false)}>{t("刷新渠道")}</Button>
        <Button size="sm" disabled={busy() || !selected() || selected() === catalog()?.defaultModel || !catalog()?.models.some(m => `${m.provider}/${m.name}` === selected())} onClick={() => void run(true)}>{t("保存默认模型")}</Button>
      </div>
      <Show when={message()}><p role="status" class="text-xs text-muted-foreground">{t(message())}</p></Show>
      <details class="border-t border-border pt-3">
        <summary class="cursor-pointer text-sm font-medium">{t("模型能力与运行策略")}</summary>
        <p class="my-3 text-xs text-muted-foreground">{t("模型能力统一从 Bifrost 读取。此处只设置 智能体的输出预算和默认思考强度，留空使用运行默认值。")}</p>
        <Show when={catalog()?.consoleUrl}>{url => <a class="block mb-3 text-sm underline" href={url()} target="_blank" rel="noopener noreferrer">{t("打开 Bifrost 模型管理 ↗")}</a>}</Show>
        <ChannelModelPicker id="runtime-policy" models={catalog()?.models ?? []} value={editedModel()}
          disabled={busy()} loading={catalog.loading}
          onChange={model => setEditing(JSON.stringify([model.provider, model.name]))} />
        <Show when={editedModel()}>{m => <div class="mt-3 space-y-3">
          <p class="text-xs" role="status">{m().effective?.ready ? t("可用于智能体任务") : t("需要补齐：{0}", { "0": m().effective?.missing.map(k => labels[k] ?? k).join(locale() === 'zh-CN' ? '、' : ', ') || t("Unknown capabilities") })} {m().effective?.errors.join('；')}</p>
          <h3 class="text-sm font-medium">{t("Bifrost 模型能力（只读）")}</h3>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded border border-border p-3 text-xs">
            <For each={[
              ['context', '上下文窗口'], ['maxInput', '最大输入'], ['maxOutput', '最大输出'], ['tools', '工具调用'], ['streaming', '流式输出'], ['vision', '图片输入'],
              ['reasoningAccounting', '思考额度规则'], ['reasoningEfforts', '支持的思考强度'], ['maxTokensField', '输出参数字段'], ['source', '能力来源说明'],
            ]}>{([key, label]) => <div><dt class="text-muted-foreground">{t(label)}</dt><dd class="mt-1 break-words">{display(key, m().effective?.[key as keyof Policy])} · {m().effective?.sources[key] === 'gateway-attribute' ? t("Bifrost 自定义属性") : m().effective?.sources[key] === 'gateway' ? t("Bifrost 目录") : t("未提供")}</dd></div>}</For>
          </dl>
          <h3 class="text-sm font-medium">{t("智能体运行策略")}</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <For each={fields}>{([key, label]) => <label class="text-xs">{t(label)}
              <input aria-label={t(label)} type="number" min="1" step="1" class="mt-1 w-full rounded border border-input bg-background p-2" value={draft()[key] ?? ''} placeholder={display(key, m().effective?.[key as keyof Policy])} onInput={e => change(key, e.currentTarget.value)} />
              <span class="block mt-1 text-muted-foreground">{t("当前：")}{display(key, m().effective?.[key as keyof Policy])} · {m().effective?.sources[key] === 'gateway' ? t("网关") : m().effective?.sources[key] === 'policy' ? t("运行策略") : t("未提供")}</span>
            </label>}</For>
            <label class="text-xs">{t("默认思考强度")}<select disabled={m().effective?.reasoningAccounting === 'none'} aria-label={t("默认思考强度")} class="mt-1 w-full rounded border border-input bg-background p-2" value={draft().reasoningEffort ?? ''} onChange={e => change('reasoningEffort', e.currentTarget.value)}><option selected={!draft().reasoningEffort} value="">{t("使用渠道默认值")}</option><For each={m().effective?.reasoningEfforts ?? []}>{v => <option selected={draft().reasoningEffort === v} value={v}>{display('reasoningEffort', v)}</option>}</For><Show when={draft().reasoningEffort && !m().effective?.reasoningEfforts?.includes(draft().reasoningEffort)}><option selected value={draft().reasoningEffort}>{display('reasoningEffort', draft().reasoningEffort)}{t("（Bifrost 已不支持，请重新选择）")}</option></Show></select></label>
          </div>
          <div class="flex justify-end"><Button size="sm" disabled={busy()} onClick={() => void saveRuntimePolicy()}>{t("保存运行策略")}</Button></div>
        </div>}</Show>
      </details>
    </section>
  );
}

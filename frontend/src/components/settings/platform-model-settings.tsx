import { createResource, createSignal, For, Show } from 'solid-js';
import { api } from '~/api/client';
import { Button } from '~/components/ui/button';

type Catalog = { models: { provider: string; name: string }[]; defaultModel: string | null };

export function PlatformModelSettings() {
  const [catalog, { mutate, refetch }] = createResource(() => api.get<Catalog>('/models'));
  const [selected, setSelected] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal('');

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
          <For each={catalog()?.models}>{m => <option value={`${m.provider}/${m.name}`}>{m.provider} / {m.name}</option>}</For>
        </select>
      </Show>
      <div class="flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy()} onClick={() => void run(false)}>刷新渠道</Button>
        <Button size="sm" disabled={busy() || !selected() || selected() === catalog()?.defaultModel} onClick={() => void run(true)}>
          保存默认模型
        </Button>
      </div>
      <Show when={message()}><p role="status" class="text-xs text-muted-foreground">{message()}</p></Show>
    </section>
  );
}

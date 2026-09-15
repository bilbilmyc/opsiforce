import { t } from '~/i18n';
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { Search } from 'lucide-solid';
import { Button } from '~/components/ui/button';

type Model = { provider: string; name: string; effective?: { ready: boolean } };
type Props = {
  id: string;
  models: Model[];
  value?: Model;
  onChange: (model: Model) => void;
  disabled?: boolean;
  loading?: boolean;
};

const PAGE_SIZE = 6;

/** Browsing a channel never changes the selection until a model is chosen. */
export function ChannelModelPicker(props: Props) {
  const [channel, setChannel] = createSignal('');
  const [query, setQuery] = createSignal('');
  const [page, setPage] = createSignal(1);
  const selectedChannel = createMemo(() => props.value?.provider ?? '');
  createEffect(() => setChannel(selectedChannel()));

  const channels = createMemo(() => {
    const counts = new Map<string, number>();
    for (const model of props.models) counts.set(model.provider, (counts.get(model.provider) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  });
  const channelModels = createMemo(() => props.models
    .filter(model => model.provider === channel())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  const filtered = createMemo(() => {
    const terms = query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return channelModels().filter(model => terms.every(term => model.name.toLowerCase().includes(term)));
  });
  createEffect(() => { channel(); query(); setPage(1); });
  const pageCount = () => Math.max(1, Math.ceil(filtered().length / PAGE_SIZE));
  const currentPage = () => Math.min(page(), pageCount());
  const visible = () => filtered().slice((currentPage() - 1) * PAGE_SIZE, currentPage() * PAGE_SIZE);
  const isSelected = (model: Model) => props.value?.provider === model.provider && props.value?.name === model.name;

  return (
    <div class="space-y-3" aria-busy={props.loading}>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="min-w-0 space-y-1.5 text-xs" for={`${props.id}-channel`}>
          <span class="block text-muted-foreground">{t("渠道")}</span>
          <select id={`${props.id}-channel`} class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={channel()} disabled={props.disabled || props.loading || !channels().length}
            onChange={event => { setChannel(event.currentTarget.value); setQuery(''); }}>
            <option value="" selected={!channel()}>{props.loading ? t("正在加载渠道…") : t("先选择渠道")}</option>
            <Show when={channel() && !channels().some(([name]) => name === channel())}>
              <option value={channel()} selected>{t("{0} (unavailable)", { 0: channel() })}</option>
            </Show>
            <For each={channels()}>{([name, count]) => <option value={name} selected={name === channel()}>{t("{0} · {1} models", { 0: name, 1: count })}</option>}</For>
          </select>
        </label>
        <label class="min-w-0 space-y-1.5 text-xs" for={`${props.id}-search`}>
          <span class="block text-muted-foreground">{t("搜索模型")}</span>
          <div class="relative">
            <Search class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <input id={`${props.id}-search`} type="search" autocomplete="off" placeholder={t("输入模型名称，如 glm、gpt")}
              class="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={query()} disabled={props.disabled || props.loading || !channel()}
              onInput={event => setQuery(event.currentTarget.value)} />
          </div>
        </label>
      </div>
      <Show when={channel()} fallback={<p class="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        {props.loading ? t("正在加载模型…") : props.models.length ? t("选择渠道后，在这里搜索和选择模型。") : t("暂无模型，请先在 Bifrost 配置渠道和模型，再刷新渠道。")}
      </p>}>
        <fieldset disabled={props.disabled || props.loading} class="min-w-0 overflow-hidden rounded-md border border-border">
          <legend class="sr-only">{t("Models in {0}", { 0: channel() })}</legend>
          <div class="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" role="status" aria-live="polite">
            <span class="truncate">{channel()}</span>
            <span class="shrink-0">{query().trim() ? t("匹配 {0} / {1} 个模型", { "0": filtered().length, "1": channelModels().length }) : t("共 {0} 个模型", { "0": channelModels().length })}</span>
          </div>
          <div class="max-h-72 overflow-y-auto overscroll-contain divide-y divide-border">
            <For each={visible()}>{model => (
              <label class={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 focus-within:bg-muted/50 ${isSelected(model) ? 'bg-muted/60' : ''} ${props.disabled ? 'opacity-60' : ''}`}>
                <input type="radio" name={`${props.id}-model`} value={JSON.stringify([model.provider, model.name])}
                  class="size-4 shrink-0 accent-primary" checked={isSelected(model)} onChange={() => props.onChange(model)} />
                <span class="min-w-0 flex-1 break-all">{model.name}</span>
                <span class="shrink-0 text-xs text-muted-foreground">{model.effective?.ready ? t("已就绪") : t("待检查")}</span>
              </label>
            )}</For>
            <Show when={!filtered().length}>
              <p class="px-3 py-5 text-sm text-muted-foreground">{channelModels().length ? t("没有匹配的模型，请换个关键词。") : t("此渠道暂无模型，请刷新渠道或检查 Bifrost 配置。")}</p>
            </Show>
          </div>
          <Show when={pageCount() > 1}>
            <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <span class="text-xs text-muted-foreground">{t("Page {0} of {1}", { 0: currentPage(), 1: pageCount() })}</span>
              <div class="flex gap-1">
                <Button type="button" variant="ghost" size="sm" aria-label={t("上一页模型")} disabled={props.disabled || props.loading || currentPage() === 1} onClick={() => setPage(currentPage() - 1)}>{t("上一页")}</Button>
                <Button type="button" variant="ghost" size="sm" aria-label={t("下一页模型")} disabled={props.disabled || props.loading || currentPage() === pageCount()} onClick={() => setPage(currentPage() + 1)}>{t("下一页")}</Button>
              </div>
            </div>
          </Show>
        </fieldset>
      </Show>
      <Show when={props.value}>{model => <p class="break-all text-xs text-muted-foreground">{t("当前选择：")}<span class="ml-1 font-medium text-foreground">{model().provider} / {model().name}</span></p>}</Show>
    </div>
  );
}

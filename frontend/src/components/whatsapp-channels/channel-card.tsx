import { createSignal, Show } from 'solid-js';
import { toast } from 'solid-sonner';
import type { WhapiChannel } from '~/api/whapi-channels';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/cn';
import { Building2, ChevronRight, Copy, Pencil, Plug, Trash2 } from '~/components/icons';
import { ChatAllowlistEditor } from './chat-allowlist-editor';

export function ChannelCard(props: {
  channel: WhapiChannel;
  onEdit: () => void;
  onConfigureWebhook: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [secretVisible, setSecretVisible] = createSignal(false);

  const copySecret = async () => {
    await navigator.clipboard.writeText(props.channel.webhookSecret);
    toast.success('Webhook secret copied');
  };

  return (
    <div class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          class="flex min-w-0 items-center gap-2 text-left"
          aria-expanded={expanded()}
        >
          <ChevronRight
            class={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', expanded() && 'rotate-90')}
          />
          <span class="truncate text-sm font-medium">{props.channel.label ?? props.channel.channelId}</span>
          <span class="truncate font-mono text-[11px] text-muted-foreground">{props.channel.channelId}</span>
        </button>

        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate">{props.channel.tenantDisplayName}</span>
        </div>

        <Badge variant="secondary" class="px-1.5 py-0 text-[10px]">
          {props.channel.routeCount} {props.channel.routeCount === 1 ? 'chat' : 'chats'}
        </Badge>

        <div class="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => props.onConfigureWebhook()}>
            <Plug class="h-3.5 w-3.5" />
            Configure webhook
          </Button>
          <button
            type="button"
            onClick={() => props.onEdit()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Edit ${props.channel.channelId}`}
          >
            <Pencil class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => props.onDelete()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            aria-label={`Delete ${props.channel.channelId}`}
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 px-3 pb-2.5 text-xs text-muted-foreground">
        <span>Webhook secret</span>
        <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          {secretVisible() ? props.channel.webhookSecret : '•'.repeat(12)}
        </code>
        <button
          type="button"
          onClick={() => setSecretVisible((prev) => !prev)}
          class="underline-offset-4 hover:underline"
        >
          {secretVisible() ? 'Hide' : 'Reveal'}
        </button>
        <button
          type="button"
          onClick={copySecret}
          class="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Copy webhook secret"
        >
          <Copy class="h-3 w-3" />
        </button>
        <span class="ml-auto font-mono text-[11px]">token {props.channel.apiTokenPreview}</span>
      </div>

      <Show when={expanded()}>
        <ChatAllowlistEditor channel={props.channel} />
      </Show>
    </div>
  );
}

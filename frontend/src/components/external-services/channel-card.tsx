import type { WhatsappChannel } from '~/api/whatsapp-channels';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { KeyRound, Pencil, Plug, Trash2 } from '~/components/icons';
import { WebhookStatusBadge } from './webhook-status-badge';

export function ChannelCard(props: {
  channel: WhatsappChannel;
  onEdit: () => void;
  onConfigureWebhook: () => void;
  onRotateSecret: () => void;
  onDelete: () => void;
}) {
  const referenceLabel = () => {
    const count = props.channel.referencedEnvironmentCount;
    return `Referenced by ${count} ${count === 1 ? 'environment' : 'environments'}`;
  };

  return (
    <div class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <span class="truncate text-sm font-medium">{props.channel.label ?? props.channel.channelId}</span>
        <span class="truncate font-mono text-[11px] text-muted-foreground">{props.channel.channelId}</span>

        <Badge variant="secondary" class="px-1.5 py-0 text-[10px]">
          {referenceLabel()}
        </Badge>

        <WebhookStatusBadge channelId={props.channel.channelId} />

        <div class="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => props.onConfigureWebhook()}>
            <Plug class="h-3.5 w-3.5" />
            Reconfigure webhook
          </Button>
          <button
            type="button"
            onClick={() => props.onRotateSecret()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Rotate the webhook secret of ${props.channel.channelId}`}
            title="Rotate webhook secret"
          >
            <KeyRound class="h-3.5 w-3.5" />
          </button>
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

      <div class="flex flex-wrap items-center gap-3 px-3 pb-2.5 text-xs text-muted-foreground">
        <span class="font-mono text-[11px]">token {props.channel.apiTokenPreview}</span>
        <span class="truncate font-mono text-[11px]">
          {props.channel.webhookUrl || 'no webhook base URL configured'}
        </span>
      </div>
    </div>
  );
}

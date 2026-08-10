import { Show } from 'solid-js';
import { useWhatsappWebhookStatus, type WhatsappWebhookState } from '~/api/whatsapp-channels';
import { Badge } from '~/components/ui/badge';

const PRESENTATION: Record<WhatsappWebhookState, { label: string; variant: 'success' | 'warning'; title: string }> = {
  'in-sync': {
    label: 'Webhook live',
    variant: 'success',
    title: 'Whapi posts incoming messages to this platform with the current secret.',
  },
  'stale-url': {
    label: 'Webhook elsewhere',
    variant: 'warning',
    title: 'Whapi posts to a different URL than this platform expects. Reconfigure to take it over.',
  },
  'stale-secret': {
    label: 'Webhook secret stale',
    variant: 'warning',
    title: 'Whapi sends an outdated secret — ingest rejects every callback. Reconfigure to push the current one.',
  },
  'missing-event': {
    label: 'Webhook missing events',
    variant: 'warning',
    title: 'The webhook exists but is not subscribed to incoming messages. Reconfigure to fix the event filter.',
  },
  'not-configured': {
    label: 'Webhook not configured',
    variant: 'warning',
    title: 'Whapi has no webhook for this channel — nothing will arrive until you configure one.',
  },
};

export function WebhookStatusBadge(props: { channelId: string }) {
  const status = useWhatsappWebhookStatus(() => props.channelId);

  const presentation = () => {
    const state = status.data?.state;
    return state ? PRESENTATION[state] : null;
  };

  return (
    <Show
      when={presentation()}
      fallback={
        <Show when={status.isError}>
          <Badge variant="outline" class="px-1.5 py-0 text-[10px]" title="Could not reach Whapi to read its webhook.">
            Webhook unknown
          </Badge>
        </Show>
      }
    >
      {(entry) => (
        <Badge variant={entry().variant} class="px-1.5 py-0 text-[10px]" title={entry().title}>
          {entry().label}
        </Badge>
      )}
    </Show>
  );
}

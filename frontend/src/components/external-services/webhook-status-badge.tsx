import { t } from '~/i18n';
import { Show } from 'solid-js';
import { useWhatsappWebhookStatus, type WhatsappWebhookState } from '~/api/whatsapp-channels';
import { Badge } from '~/components/ui/badge';

const PRESENTATION: Record<WhatsappWebhookState, { label: string; variant: 'success' | 'warning'; title: string }> = {
  'in-sync': {
    get label() { return t("Webhook live"); },
    variant: 'success',
    get title() { return t("Whapi posts incoming messages to this platform with the current secret."); },
  },
  'stale-url': {
    get label() { return t("Webhook elsewhere"); },
    variant: 'warning',
    get title() { return t("Whapi posts to a different URL than this platform expects. Reconfigure to take it over."); },
  },
  'stale-secret': {
    get label() { return t("Webhook secret stale"); },
    variant: 'warning',
    get title() { return t("Whapi sends an outdated secret — ingest rejects every callback. Reconfigure to push the current one."); },
  },
  'missing-event': {
    get label() { return t("Webhook missing events"); },
    variant: 'warning',
    get title() { return t("The webhook exists but is not subscribed to incoming messages. Reconfigure to fix the event filter."); },
  },
  'not-configured': {
    get label() { return t("Webhook not configured"); },
    variant: 'warning',
    get title() { return t("Whapi has no webhook for this channel — nothing will arrive until you configure one."); },
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
          <Badge variant="outline" class="px-1.5 py-0 text-[10px]" title={t("Could not reach Whapi to read its webhook.")}>{t("Webhook unknown")}</Badge>
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

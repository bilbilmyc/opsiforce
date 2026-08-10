import { createEffect, createSignal } from 'solid-js';
import { toast } from 'solid-sonner';
import { useConfigureWhatsappWebhook, type WhatsappChannel } from '~/api/whatsapp-channels';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { LabeledTextField } from './labeled-text-field';

export function ConfigureWebhookDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: WhatsappChannel | null;
}) {
  const configure = useConfigureWhatsappWebhook();
  const [webhookUrl, setWebhookUrl] = createSignal('');

  createEffect(() => {
    if (!props.open) return;
    setWebhookUrl(props.channel?.webhookUrl ?? '');
  });

  const canSubmit = () => /^https?:\/\/\S+$/.test(webhookUrl().trim());

  const submit = async () => {
    const channel = props.channel;
    if (!channel || !canSubmit()) return;

    try {
      const result = await configure.mutateAsync({ channelId: channel.channelId, webhookUrl: webhookUrl().trim() });
      toast.success(`Whapi now posts to ${result.webhookUrl}`);
      props.onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to configure the webhook');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure webhook</DialogTitle>
          <DialogDescription>
            Pushes the callback URL, the secret header, and the <span class="font-mono">messages.post</span> event
            filter to Whapi for this channel.
          </DialogDescription>
        </DialogHeader>

        <div class="mt-4 space-y-3">
          <LabeledTextField
            label="Webhook URL"
            value={webhookUrl()}
            onInput={setWebhookUrl}
            placeholder="https://opsiforce.example.com/api/external-services/webhooks/whatsapp"
            mono
            autofocus
            onEnter={submit}
            error={webhookUrl().trim() && !canSubmit() ? 'Must be an http(s) URL' : null}
          />
          <p class="text-xs text-muted-foreground">
            The channel's webhook secret is sent as a static header on every callback; ingest rejects anything else.
          </p>
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit()} loading={configure.isPending}>
            Configure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

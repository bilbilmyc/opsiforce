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

export function ConfigureWebhookDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: WhatsappChannel | null;
}) {
  const configure = useConfigureWhatsappWebhook();

  const submit = async () => {
    const channel = props.channel;
    if (!channel) return;

    try {
      const result = await configure.mutateAsync(channel.channelId);
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
          <DialogTitle>Reconfigure webhook</DialogTitle>
          <DialogDescription>
            Registration already pushed these settings. Re-push the callback URL, the secret header, and the{' '}
            <span class="font-mono">messages.post</span> event filter to Whapi to repair this channel; any other webhook
            on it is left untouched.
          </DialogDescription>
        </DialogHeader>

        <div class="mt-4 space-y-3">
          <div class="space-y-1">
            <p class="text-xs font-medium text-muted-foreground">Webhook URL</p>
            <p class="rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs break-all">
              {props.channel?.webhookUrl || 'Not available — EXTERNAL_SERVICES_WEBHOOK_BASE_URL is not set'}
            </p>
          </div>
          <p class="text-xs text-muted-foreground">
            The URL is derived from the deployment's webhook base and cannot be changed here. The channel's webhook
            secret is sent as a static header on every callback; ingest rejects anything else.
          </p>
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={!props.channel || !props.channel.webhookUrl}
            loading={configure.isPending}
          >
            Configure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { createEffect, createSignal, Show } from 'solid-js';
import { toast } from 'solid-sonner';
import { useCreateWhatsappChannel, useUpdateWhatsappChannel, type WhatsappChannel } from '~/api/whatsapp-channels';
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

export function ChannelDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: WhatsappChannel | null;
}) {
  const create = useCreateWhatsappChannel();
  const update = useUpdateWhatsappChannel();

  const [channelId, setChannelId] = createSignal('');
  const [apiToken, setApiToken] = createSignal('');
  const [label, setLabel] = createSignal('');

  const isEdit = () => props.channel !== null;

  createEffect(() => {
    if (!props.open) return;
    const channel = props.channel;
    setChannelId(channel?.channelId ?? '');
    setLabel(channel?.label ?? '');
    setApiToken('');
  });

  const canSubmit = () => {
    if (isEdit()) return apiToken().trim().length > 0 || label().trim() !== (props.channel?.label ?? '');
    return channelId().trim().length > 0 && apiToken().trim().length > 0;
  };

  const submit = async () => {
    if (!canSubmit()) return;
    const existing = props.channel;

    try {
      if (existing) {
        await update.mutateAsync({
          channelId: existing.channelId,
          dto: {
            ...(apiToken().trim() ? { apiToken: apiToken().trim() } : {}),
            label: label().trim() || null,
          },
        });
        toast.success('Channel updated');
      } else {
        await create.mutateAsync({
          channelId: channelId().trim(),
          apiToken: apiToken().trim(),
          label: label().trim() || null,
        });
        toast.success('Channel registered');
      }
      props.onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save channel');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit() ? 'Edit channel' : 'Register a WhatsApp channel'}</DialogTitle>
          <DialogDescription>
            {isEdit()
              ? 'Paste a new API token to rotate it, or change the label. The webhook secret stays the same.'
              : 'Create the channel in the Whapi dashboard and link its number first, then register it here. Environments reference registered channels from their External services dialog.'}
          </DialogDescription>
        </DialogHeader>

        <div class="mt-4 space-y-3">
          <Show
            when={!isEdit()}
            fallback={
              <div class="space-y-1">
                <span class="block text-xs text-muted-foreground">Channel</span>
                <p class="font-mono text-xs">{props.channel?.channelId}</p>
              </div>
            }
          >
            <LabeledTextField
              label="Whapi channel id"
              value={channelId()}
              onInput={setChannelId}
              placeholder="e.g. DEADPL-HPHMZ"
              mono
              autofocus
            />
          </Show>

          <LabeledTextField
            label={isEdit() ? 'New API token (optional)' : 'API token'}
            value={apiToken()}
            onInput={setApiToken}
            placeholder={isEdit() ? `Currently ${props.channel?.apiTokenPreview ?? ''}` : 'Paste the channel token'}
            mono
            hint="Used outbound only — chat enumeration, webhook configuration, and media fetches."
          />

          <LabeledTextField
            label="Label (optional)"
            value={label()}
            onInput={setLabel}
            placeholder="e.g. Night shift dispatch, Warehouse 4"
            onEnter={submit}
          />
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit()} loading={create.isPending || update.isPending}>
            {isEdit() ? 'Save' : 'Register'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

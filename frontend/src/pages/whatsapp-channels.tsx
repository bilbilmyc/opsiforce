import { createMemo, createSignal, For, Show } from 'solid-js';
import { toast } from 'solid-sonner';
import { useDeleteWhapiChannel, useWhapiChannels, type WhapiChannel } from '~/api/whapi-channels';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import ConfirmDialog from '~/components/ui/confirm-dialog';
import Skeleton from '~/components/ui/skeleton';
import { cn } from '~/lib/cn';
import { MessageSquare, Plus, RefreshCw } from '~/components/icons';
import { ChannelCard } from '~/components/whatsapp-channels/channel-card';
import { ChannelDialog } from '~/components/whatsapp-channels/channel-dialog';
import { ConfigureWebhookDialog } from '~/components/whatsapp-channels/configure-webhook-dialog';

export function WhatsAppChannelsPage() {
  const channels = useWhapiChannels();
  const remove = useDeleteWhapiChannel();

  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<WhapiChannel | null>(null);
  const [configuring, setConfiguring] = createSignal<WhapiChannel | null>(null);
  const [pendingDelete, setPendingDelete] = createSignal<WhapiChannel | null>(null);

  const rows = createMemo(() => channels.data ?? []);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (channel: WhapiChannel) => {
    setEditing(channel);
    setDialogOpen(true);
  };

  const confirmDelete = () => {
    const channel = pendingDelete();
    if (!channel) return;
    remove.mutate(channel.id, {
      onSuccess: () => toast.success('Channel deleted'),
      onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete the channel'),
    });
  };

  return (
    <div class="h-full w-full overflow-y-auto px-4 py-6">
      <div class="mb-1 flex items-center gap-3">
        <MessageSquare class="h-5 w-5 text-muted-foreground" />
        <h1 class="text-xl font-semibold">WhatsApp</h1>
        <Show when={!channels.isPending}>
          <Badge variant="secondary" class="px-1.5 py-0 text-[10px]">
            {rows().length}
          </Badge>
        </Show>
        <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => channels.refetch()}
            class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Refresh channels"
          >
            <RefreshCw class={cn('h-3.5 w-3.5', channels.isFetching && 'animate-spin')} />
          </button>
          <Button size="sm" onClick={openCreate}>
            <Plus class="h-3.5 w-3.5" />
            Add channel
          </Button>
        </div>
      </div>

      <p class="mb-5 ml-8 text-xs text-muted-foreground">
        Whapi channels registered per organization, and the chats allowed to feed each project environment. Create and
        QR-link the channel in the Whapi dashboard first, then register it here, configure its webhook, and allowlist
        chats.
      </p>

      <Show when={channels.isPending}>
        <div class="space-y-2">
          <Skeleton class="h-16 w-full" />
          <Skeleton class="h-16 w-full" />
        </div>
      </Show>

      <Show when={!channels.isPending && channels.isError}>
        <div class="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-8 text-center">
          <p class="text-sm text-muted-foreground">Could not load channels.</p>
          <Button size="sm" variant="outline" onClick={() => channels.refetch()}>
            <RefreshCw class="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      </Show>

      <Show when={!channels.isPending && !channels.isError && rows().length === 0}>
        <div class="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <MessageSquare class="h-6 w-6 text-muted-foreground" />
          <p class="text-sm font-medium">No channels registered</p>
          <p class="text-xs text-muted-foreground">
            Register a Whapi channel for an organization to start routing WhatsApp messages into environments.
          </p>
        </div>
      </Show>

      <div class="space-y-2">
        <For each={rows()}>
          {(channel) => (
            <ChannelCard
              channel={channel}
              onEdit={() => openEdit(channel)}
              onConfigureWebhook={() => setConfiguring(channel)}
              onDelete={() => setPendingDelete(channel)}
            />
          )}
        </For>
      </div>

      <ChannelDialog open={dialogOpen()} onOpenChange={setDialogOpen} channel={editing()} />

      <ConfigureWebhookDialog
        open={configuring() !== null}
        onOpenChange={(open) => {
          if (!open) setConfiguring(null);
        }}
        channel={configuring()}
      />

      <ConfirmDialog
        open={pendingDelete() !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete channel"
        description={`This unregisters channel ${pendingDelete()?.channelId ?? ''} and deletes its chat allowlist. Messages from it will no longer be stored. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

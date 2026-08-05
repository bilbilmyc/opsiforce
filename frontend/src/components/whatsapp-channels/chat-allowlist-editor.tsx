import { createMemo, createSignal, For, Show } from 'solid-js';
import { toast } from 'solid-sonner';
import {
  useCreateWhapiChatRoute,
  useDeleteWhapiChatRoute,
  useWhapiChatRoutes,
  useWhapiChats,
  useWhapiRoutableEnvironments,
  type WhapiChannel,
  type WhapiChatOption,
  type WhapiChatRoute,
  type WhapiRoutableEnvironment,
} from '~/api/whapi-channels';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import Skeleton from '~/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { MessageSquare, Plus, RefreshCw, Trash2, Users } from '~/components/icons';
import { LabeledTextField } from './labeled-text-field';

interface ChatGroup {
  chatId: string;
  chatName: string | null;
  routes: WhapiChatRoute[];
}

function environmentLabel(environment: WhapiRoutableEnvironment): string {
  return `${environment.projectTitle?.trim() || 'Untitled project'} · ${environment.environmentName}`;
}

function chatLabel(chat: WhapiChatOption): string {
  return chat.name?.trim() || chat.chatId;
}

function groupRoutes(routes: WhapiChatRoute[]): ChatGroup[] {
  const groups: ChatGroup[] = [];
  for (const route of routes) {
    const existing = groups.find((group) => group.chatId === route.chatId);
    if (existing) {
      existing.routes.push(route);
      existing.chatName = existing.chatName ?? route.chatName;
      continue;
    }
    groups.push({ chatId: route.chatId, chatName: route.chatName, routes: [route] });
  }
  return groups;
}

export function ChatAllowlistEditor(props: { channel: WhapiChannel }) {
  const channelId = () => props.channel.id;

  const routes = useWhapiChatRoutes(channelId);
  const environments = useWhapiRoutableEnvironments(channelId);
  const [chatsRequested, setChatsRequested] = createSignal(false);
  const chats = useWhapiChats(channelId, chatsRequested);

  const create = useCreateWhapiChatRoute();
  const remove = useDeleteWhapiChatRoute();

  const [manual, setManual] = createSignal(false);
  const [selectedChat, setSelectedChat] = createSignal<WhapiChatOption | null>(null);
  const [manualChatId, setManualChatId] = createSignal('');
  const [manualChatName, setManualChatName] = createSignal('');
  const [environment, setEnvironment] = createSignal<WhapiRoutableEnvironment | null>(null);

  const groups = createMemo(() => groupRoutes(routes.data ?? []));

  const chatId = () => (manual() ? manualChatId().trim() : (selectedChat()?.chatId ?? ''));
  const chatName = () => (manual() ? manualChatName().trim() || null : (selectedChat()?.name ?? null));
  const chatIdValid = () => /^[^\s@]+@[^\s@]+$/.test(chatId());
  const canSubmit = () => chatIdValid() && environment() !== null;

  const submit = async () => {
    const target = environment();
    if (!canSubmit() || !target) return;

    try {
      await create.mutateAsync({
        id: channelId(),
        dto: { chatId: chatId(), chatName: chatName(), projectEnvironmentId: target.projectEnvironmentId },
      });
      toast.success('Chat allowlisted');
      setSelectedChat(null);
      setManualChatId('');
      setManualChatName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to allowlist the chat');
    }
  };

  const removeRoute = (route: WhapiChatRoute) => {
    remove.mutate(
      { id: channelId(), routeId: route.id },
      {
        onSuccess: () => toast.success('Route removed'),
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove the route'),
      }
    );
  };

  return (
    <div class="space-y-3 border-t border-border px-3 py-3">
      <Show
        when={!routes.isPending}
        fallback={
          <div class="space-y-2">
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-full" />
          </div>
        }
      >
        <Show
          when={groups().length > 0}
          fallback={
            <p class="text-xs text-muted-foreground">
              No chats allowlisted yet. Messages from this channel are dropped until a chat is mapped to an environment.
            </p>
          }
        >
          <div class="space-y-2">
            <For each={groups()}>
              {(group) => (
                <div class="rounded-md border border-border bg-background p-2">
                  <div class="flex items-center gap-2">
                    <Show
                      when={group.chatId.endsWith('@g.us')}
                      fallback={<MessageSquare class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    >
                      <Users class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Show>
                    <span class="truncate text-xs font-medium">{group.chatName ?? group.chatId}</span>
                    <span class="truncate font-mono text-[11px] text-muted-foreground">{group.chatId}</span>
                    <Badge variant="secondary" class="ml-auto px-1.5 py-0 text-[10px]">
                      {group.routes.length}
                    </Badge>
                  </div>
                  <div class="mt-1.5 space-y-1 pl-5">
                    <For each={group.routes}>
                      {(route) => (
                        <div class="flex items-center gap-2">
                          <span class="truncate text-xs">
                            {route.projectTitle?.trim() || 'Untitled project'} · {route.environmentName}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeRoute(route)}
                            class="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                            aria-label={`Remove ${route.chatId} from ${route.environmentName}`}
                          >
                            <Trash2 class="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <div class="space-y-2 rounded-md border border-dashed border-border p-2.5">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium">Allowlist a chat</span>
          <button
            type="button"
            onClick={() => setManual((prev) => !prev)}
            class="ml-auto text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {manual() ? 'Pick from Whapi' : 'Enter an id manually'}
          </button>
        </div>

        <Show
          when={manual()}
          fallback={
            <div class="space-y-1">
              <Show
                when={chatsRequested()}
                fallback={
                  <Button size="sm" variant="outline" class="w-full" onClick={() => setChatsRequested(true)}>
                    <RefreshCw class="h-3.5 w-3.5" />
                    Load chats and groups from Whapi
                  </Button>
                }
              >
                <Show when={!chats.isPending} fallback={<Skeleton class="h-8 w-full" />}>
                  <Show
                    when={!chats.isError}
                    fallback={
                      <div class="space-y-1">
                        <p class="text-xs text-destructive">
                          {chats.error instanceof Error ? chats.error.message : 'Could not reach Whapi'}
                        </p>
                        <Button size="sm" variant="outline" class="w-full" onClick={() => chats.refetch()}>
                          <RefreshCw class="h-3.5 w-3.5" />
                          Try again
                        </Button>
                      </div>
                    }
                  >
                    <span class="block text-xs text-muted-foreground">Chat</span>
                    <Select
                      options={chats.data ?? []}
                      optionValue="chatId"
                      optionTextValue="chatId"
                      value={selectedChat()}
                      onChange={setSelectedChat}
                      itemComponent={(itemProps) => (
                        <SelectItem item={itemProps.item}>
                          {chatLabel(itemProps.item.rawValue)}
                          <span class="ml-2 text-[10px] text-muted-foreground">{itemProps.item.rawValue.kind}</span>
                        </SelectItem>
                      )}
                    >
                      <SelectTrigger aria-label="Chat">
                        <SelectValue<WhapiChatOption>>
                          {(state) => {
                            const chat = state.selectedOption();
                            return <span>{chat ? chatLabel(chat) : 'Select a chat or group'}</span>;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent />
                    </Select>
                    <Show when={selectedChat()}>
                      {(chat) => <p class="font-mono text-[11px] text-muted-foreground">{chat().chatId}</p>}
                    </Show>
                  </Show>
                </Show>
              </Show>
            </div>
          }
        >
          <LabeledTextField
            label="Chat id"
            value={manualChatId()}
            onInput={setManualChatId}
            placeholder="1234567890@s.whatsapp.net or 1234567890@g.us"
            mono
            error={manualChatId().trim() && !chatIdValid() ? 'Expected a Whapi chat id with an @ suffix' : null}
          />
          <LabeledTextField
            label="Display name (optional)"
            value={manualChatName()}
            onInput={setManualChatName}
            placeholder="e.g. Ops group"
          />
        </Show>

        <div class="space-y-1">
          <span class="block text-xs text-muted-foreground">Environment</span>
          <Select
            options={environments.data ?? []}
            optionValue="projectEnvironmentId"
            optionTextValue="environmentName"
            value={environment()}
            onChange={setEnvironment}
            itemComponent={(itemProps) => (
              <SelectItem item={itemProps.item}>{environmentLabel(itemProps.item.rawValue)}</SelectItem>
            )}
          >
            <SelectTrigger aria-label="Environment">
              <SelectValue<WhapiRoutableEnvironment>>
                {(state) => {
                  const selected = state.selectedOption();
                  return <span>{selected ? environmentLabel(selected) : 'Select an environment'}</span>;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
          <Show when={(environments.data ?? []).length === 0 && !environments.isPending}>
            <p class="text-xs text-muted-foreground">
              {props.channel.tenantDisplayName} has no project environments yet.
            </p>
          </Show>
        </div>

        <div class="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!canSubmit()} loading={create.isPending}>
            <Plus class="h-3.5 w-3.5" />
            Allowlist
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          The same chat can feed several environments — add it once per environment.
        </p>
      </div>
    </div>
  );
}

import { For, Show, createMemo } from 'solid-js';
import { useEnvironments, type Environment } from '~/api/environments';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/cn';

const MAX_VISIBLE_DOTS = 4;

export function EnvironmentDots(props: { environmentIds: string[]; dimmed?: boolean }) {
  const environments = useEnvironments();

  const resolved = createMemo(() => {
    const registry = environments.data;
    if (!registry) return [];
    const byId = new Map(registry.map((env) => [env.id, env]));
    return props.environmentIds
      .map((id) => byId.get(id))
      .filter((env): env is Environment => env !== undefined)
      .toSorted(
        (a, b) =>
          Number(b.isDefault) - Number(a.isDefault) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  });

  const visible = createMemo(() => resolved().slice(0, MAX_VISIBLE_DOTS));
  const overflow = createMemo(() => resolved().length - visible().length);

  return (
    <Show when={resolved().length > 0}>
      <div class={cn('flex items-center gap-1', props.dimmed && 'opacity-50')}>
        <For each={visible()}>
          {(env) => (
            <Tooltip>
              <TooltipTrigger
                as="span"
                class="h-2 w-2 rounded-full ring-1 ring-inset ring-black/25 shrink-0"
                style={{ 'background-color': env.color }}
                aria-label={env.name}
              />
              <TooltipContent>{env.name}</TooltipContent>
            </Tooltip>
          )}
        </For>
        <Show when={overflow() > 0}>
          <span class="text-xs text-sidebar-muted-foreground">+{overflow()}</span>
        </Show>
      </div>
    </Show>
  );
}

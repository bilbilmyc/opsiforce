import { For, Show, createMemo } from 'solid-js';
import { useEnvironments, type Environment } from '~/api/environments';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/cn';

const MAX_VISIBLE_BADGES = 3;

function environmentAbbreviation(env: Environment) {
  const letters = (env.slug || env.name).replace(/[^a-z0-9]/gi, '');
  return (letters.slice(0, 3) || '?').toUpperCase();
}

function readableForeground(hex: string) {
  const digits = hex.replace('#', '');
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  if (expanded.length !== 6) return '#ffffff';

  const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255);
  if (channels.some(Number.isNaN)) return '#ffffff';

  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = channels.map(linear);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.4 ? '#111111' : '#ffffff';
}

export function EnvironmentBadges(props: { environmentIds: string[]; dimmed?: boolean }) {
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
          Number(b.isDefault) - Number(a.isDefault) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  });

  const visible = createMemo(() => resolved().slice(0, MAX_VISIBLE_BADGES));
  const overflow = createMemo(() => resolved().length - visible().length);
  const overflowNames = createMemo(() =>
    resolved()
      .slice(MAX_VISIBLE_BADGES)
      .map((env) => env.name)
      .join(', ')
  );

  return (
    <Show when={resolved().length > 0}>
      <div class={cn('flex items-center gap-0.5 min-w-0', props.dimmed && 'opacity-50')}>
        <For each={visible()}>
          {(env) => (
            <Tooltip>
              <TooltipTrigger
                as="span"
                class="inline-flex h-3.5 shrink-0 items-center rounded-sm px-[3px] text-[9px] font-semibold uppercase leading-none tracking-tight ring-1 ring-inset ring-black/15"
                style={{ 'background-color': env.color, color: readableForeground(env.color) }}
                aria-label={env.name}
              >
                {environmentAbbreviation(env)}
              </TooltipTrigger>
              <TooltipContent>{env.name}</TooltipContent>
            </Tooltip>
          )}
        </For>
        <Show when={overflow() > 0}>
          <Tooltip>
            <TooltipTrigger as="span" class="text-[9px] leading-none text-sidebar-muted-foreground">
              +{overflow()}
            </TooltipTrigger>
            <TooltipContent>{overflowNames()}</TooltipContent>
          </Tooltip>
        </Show>
      </div>
    </Show>
  );
}

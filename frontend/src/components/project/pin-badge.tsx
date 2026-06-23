import { Show } from 'solid-js';
import { Pin } from '~/components/icons';
import { config } from '~/config/config';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';
import { cn } from '~/lib/cn';

export interface PinBadgeProps {
  isPinned: boolean;
  compact?: boolean;
  class?: string;
}

export default function PinBadge(props: PinBadgeProps) {
  return (
    <Show when={props.isPinned}>
      <Tooltip>
        <TooltipTrigger
          as="span"
          class={cn(
            'inline-flex items-center justify-center text-amber-600 shrink-0',
            props.compact ? 'w-4 h-4' : 'rounded-md px-1.5 py-0.5 bg-amber-50',
            props.class
          )}
          aria-label={`Pinned to ${config.catalogLabel}`}
        >
          <Pin class={props.compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </TooltipTrigger>
        <TooltipContent>Pinned to {config.catalogLabel}</TooltipContent>
      </Tooltip>
    </Show>
  );
}

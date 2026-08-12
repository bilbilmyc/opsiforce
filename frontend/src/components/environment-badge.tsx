import type { Environment } from '~/api/environments';
import { cn } from '~/lib/cn';
import { environmentBadgeLabel } from '~/lib/environment-label';

function badgeTint(color: string, percent: number) {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

function badgeText(color: string) {
  return `color-mix(in srgb, ${color} 62%, #1f2937)`;
}

export function EnvironmentBadge(props: {
  environment: Pick<Environment, 'name' | 'slug' | 'shortName' | 'color'>;
  class?: string;
}) {
  return (
    <span
      class={cn(
        'inline-flex h-3.5 shrink-0 items-center rounded px-1 text-[9px] font-semibold leading-none tracking-wide ring-1 ring-inset',
        props.class
      )}
      style={{
        'background-color': badgeTint(props.environment.color, 14),
        color: badgeText(props.environment.color),
        '--tw-ring-color': badgeTint(props.environment.color, 32),
      }}
    >
      {environmentBadgeLabel(props.environment)}
    </span>
  );
}

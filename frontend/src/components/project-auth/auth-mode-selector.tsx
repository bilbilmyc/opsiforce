import { For, type JSX } from 'solid-js';
import type { ProjectAuthMode } from '~/api/client';
import { config } from '~/config/config';
import { cn } from '~/lib/cn';
import { Globe, Lock, ShieldCheck } from '~/components/icons';

interface ModeOption {
  value: ProjectAuthMode;
  title: string;
  description: string;
  icon: (props: { class?: string }) => JSX.Element;
}

function options(): ModeOption[] {
  const opts: ModeOption[] = [
    {
      value: 'public',
      title: 'Public',
      description: "Anyone can access this project's preview URL without signing in.",
      icon: Globe,
    },
  ];
  if (config.managedAuthEnabled) {
    opts.push({
      value: 'managed',
      title: config.managedAuthLabel,
      description: config.managedAuthDescription,
      icon: ShieldCheck,
    });
  }
  opts.push({
    value: 'manual',
    title: 'Manual',
    description: 'Require login via a custom auth provider before the preview loads.',
    icon: Lock,
  });
  return opts;
}

export interface AuthModeSelectorProps {
  value: ProjectAuthMode;
  onChange: (mode: ProjectAuthMode) => void;
  disabled?: boolean;
}

export function AuthModeSelector(props: AuthModeSelectorProps) {
  const opts = options();
  return (
    <div role="radiogroup" class={cn('grid gap-2', opts.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      <For each={opts}>
        {(opt) => {
          const selected = () => props.value === opt.value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected()}
              disabled={props.disabled}
              onClick={() => props.onChange(opt.value)}
              class="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              classList={{
                'border-primary bg-primary/5': selected(),
                'border-border hover:bg-accent/40': !selected(),
              }}
            >
              <div class="flex items-center gap-1.5">
                <opt.icon class="w-3.5 h-3.5" />
                <span class="text-xs font-medium">{opt.title}</span>
              </div>
              <p class="text-xs text-muted-foreground leading-snug">{opt.description}</p>
            </button>
          );
        }}
      </For>
    </div>
  );
}

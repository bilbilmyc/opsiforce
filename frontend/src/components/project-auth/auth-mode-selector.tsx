import { For, type JSX } from 'solid-js';
import type { ProjectAuthMode } from '~/api/client';
import { Globe, Lock, ShieldCheck } from '~/components/icons';

interface ModeOption {
  value: ProjectAuthMode;
  title: string;
  description: string;
  icon: (props: { class?: string }) => JSX.Element;
}

const OPTIONS: ModeOption[] = [
  {
    value: 'public',
    title: 'Public',
    description: "Anyone can access this project's preview URL without signing in.",
    icon: Globe,
  },
  {
    value: 'makara',
    title: 'Makara',
    description: 'Reuse the existing Makara Keycloak sign-in — no configuration needed.',
    icon: ShieldCheck,
  },
  {
    value: 'manual',
    title: 'Manual',
    description: 'Require login via a custom auth provider before the preview loads.',
    icon: Lock,
  },
];

export interface AuthModeSelectorProps {
  value: ProjectAuthMode;
  onChange: (mode: ProjectAuthMode) => void;
  disabled?: boolean;
}

export function AuthModeSelector(props: AuthModeSelectorProps) {
  return (
    <div role="radiogroup" class="grid grid-cols-3 gap-2">
      <For each={OPTIONS}>
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

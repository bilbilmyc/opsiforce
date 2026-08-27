import { For } from 'solid-js';
import { cn } from '~/lib/cn';

export type PreviewMode = 'app' | 'file';

const PREVIEW_MODE_LABELS: Record<PreviewMode, string> = { app: 'App', file: 'File' };
const PREVIEW_MODES: PreviewMode[] = ['app', 'file'];

export interface PreviewModeSwitchProps {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}

export function PreviewModeSwitch(props: PreviewModeSwitchProps) {
  return (
    <div class="flex items-center h-6 rounded-md border border-border overflow-hidden shrink-0">
      <For each={PREVIEW_MODES}>
        {(mode) => (
          <button
            type="button"
            aria-pressed={props.mode === mode}
            class={cn(
              'h-full px-2 text-xs transition-colors',
              props.mode === mode
                ? 'bg-accent font-medium text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => props.onChange(mode)}
          >
            {PREVIEW_MODE_LABELS[mode]}
          </button>
        )}
      </For>
    </div>
  );
}

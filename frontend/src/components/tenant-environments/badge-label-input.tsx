import { Show, type JSX } from 'solid-js';
import { ENVIRONMENT_SHORT_NAME_MAX_LENGTH, isEnvironmentShortNameValid } from '~/lib/environment-label';

export function BadgeLabelInput(props: {
  value: string;
  onInput: (value: string) => void;
  onEnter: () => void;
  placeholder: string;
  hint: JSX.Element;
}) {
  return (
    <div class="space-y-1">
      <input
        type="text"
        value={props.value}
        maxLength={ENVIRONMENT_SHORT_NAME_MAX_LENGTH}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') props.onEnter();
        }}
        class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs uppercase shadow-sm transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder={props.placeholder}
        aria-label="Badge label"
      />
      <Show
        when={isEnvironmentShortNameValid(props.value)}
        fallback={<p class="text-xs text-destructive">2–5 letters or digits, or empty to derive from the slug</p>}
      >
        {props.hint}
      </Show>
    </div>
  );
}

import { Index, Show } from 'solid-js';
import { Plus, Trash2 } from '~/components/icons';
import { Button } from '~/components/ui/button';
import { FieldWithTooltip, TextInput } from './field-with-tooltip';

export interface BypassPathsEditorProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function BypassPathsEditor(props: BypassPathsEditorProps) {
  const setAt = (index: number, v: string) => {
    const next = [...props.value];
    next[index] = v;
    props.onChange(next);
  };
  const removeAt = (index: number) => {
    props.onChange(props.value.filter((_, i) => i !== index));
  };
  const addRow = () => {
    props.onChange([...props.value, '']);
  };

  return (
    <FieldWithTooltip
      label="Bypass Auth Paths"
      tooltip="Paths within your app that should skip authentication. Matches any request whose URL path starts with the given string (e.g. /api/webhooks bypasses /api/webhooks/anything)."
    >
      <div class="space-y-2">
        <Index each={props.value}>
          {(path, i) => (
            <div class="flex items-center gap-2">
              <TextInput value={path()} onInput={(v) => setAt(i, v)} placeholder="/public" disabled={props.disabled} />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removeAt(i)}
                disabled={props.disabled}
                aria-label={`Remove path ${path() || i + 1}`}
              >
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
          )}
        </Index>
        <Show when={props.value.length === 0}>
          <p class="text-xs text-muted-foreground">No bypass paths configured. All requests require authentication.</p>
        </Show>
        <Button type="button" size="sm" variant="outline" onClick={addRow} disabled={props.disabled}>
          <Plus class="w-4 h-4 mr-1" />
          Add path
        </Button>
      </div>
    </FieldWithTooltip>
  );
}

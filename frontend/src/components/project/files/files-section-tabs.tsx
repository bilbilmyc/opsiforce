import { For } from 'solid-js';
import { cn } from '~/lib/cn';
import type { FilesSectionKey } from '~/api/files';

export const FILES_SECTION_ORDER: FilesSectionKey[] = ['generated', 'uploads', 'other'];

export const FILES_SECTION_LABELS: Record<FilesSectionKey, string> = {
  uploads: 'User uploads',
  generated: 'Generated files',
  other: 'Other files',
};

export interface FilesSectionTabsProps {
  active: FilesSectionKey;
  counts: Record<FilesSectionKey, number>;
  onChange: (key: FilesSectionKey) => void;
}

export function FilesSectionTabs(props: FilesSectionTabsProps) {
  return (
    <div class="flex items-center gap-1.5 flex-wrap">
      <For each={FILES_SECTION_ORDER}>
        {(key) => (
          <button
            type="button"
            aria-pressed={props.active === key}
            class={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors',
              props.active === key
                ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
            onClick={() => props.onChange(key)}
          >
            {FILES_SECTION_LABELS[key]}
            <span class="tabular-nums opacity-60">{props.counts[key]}</span>
          </button>
        )}
      </For>
    </div>
  );
}

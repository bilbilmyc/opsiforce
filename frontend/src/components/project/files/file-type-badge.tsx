import { Show } from 'solid-js';
import { Folder } from '~/components/icons';
import { cn } from '~/lib/cn';
import { fileExtensionOf } from '~/lib/file-extension';
import type { FileEntryType } from '~/api/files';

const EXTENSION_COLORS: Record<string, string> = {
  pdf: 'bg-red-500/15 text-red-600 dark:text-red-400',
  doc: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  docx: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  ppt: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  pptx: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  xls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  xlsx: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  csv: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  md: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  txt: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  png: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  jpg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  jpeg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  gif: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  svg: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  zip: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
};

export function FileTypeBadge(props: { name: string; type: FileEntryType; class?: string }) {
  const extension = () => fileExtensionOf(props.name);

  return (
    <Show
      when={props.type === 'file'}
      fallback={
        <span
          class={cn(
            'shrink-0 flex items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400',
            props.class ?? 'w-8 h-8'
          )}
        >
          <Folder class="w-4 h-4" />
        </span>
      }
    >
      <span
        class={cn(
          'shrink-0 flex items-center justify-center rounded-md font-bold uppercase overflow-hidden',
          EXTENSION_COLORS[extension()] ?? 'bg-muted text-muted-foreground',
          props.class ?? 'w-8 h-8'
        )}
      >
        {extension().slice(0, 4) || '·'}
      </span>
    </Show>
  );
}

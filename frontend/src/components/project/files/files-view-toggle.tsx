import { LayoutGrid, List } from '~/components/icons';
import { cn } from '~/lib/cn';

export type FilesViewMode = 'table' | 'cards';

export interface FilesViewToggleProps {
  mode: FilesViewMode;
  onChange: (mode: FilesViewMode) => void;
}

export function FilesViewToggle(props: FilesViewToggleProps) {
  const buttonClass = (mode: FilesViewMode) =>
    cn(
      'p-1 rounded',
      props.mode === mode ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
    );

  return (
    <div class="flex items-center rounded-md border border-border p-0.5 shrink-0">
      <button
        type="button"
        class={buttonClass('table')}
        title="Table view"
        aria-pressed={props.mode === 'table'}
        onClick={() => props.onChange('table')}
      >
        <List class="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        class={buttonClass('cards')}
        title="Card view"
        aria-pressed={props.mode === 'cards'}
        onClick={() => props.onChange('cards')}
      >
        <LayoutGrid class="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

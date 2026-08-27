import { For, Show } from 'solid-js';
import { ChevronRight } from '~/components/icons';

export interface FilesBreadcrumbsProps {
  rootLabel: string;
  segments: string[];
  onNavigate: (depth: number) => void;
}

export function FilesBreadcrumbs(props: FilesBreadcrumbsProps) {
  return (
    <div class="flex items-center gap-1.5 text-xs min-w-0">
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => props.onNavigate(0)}
      >
        {props.rootLabel}
      </button>
      <For each={props.segments}>
        {(segment, index) => (
          <>
            <ChevronRight class="w-3 h-3 text-muted-foreground shrink-0" />
            <Show
              when={index() < props.segments.length - 1}
              fallback={<span class="font-medium truncate">{segment}</span>}
            >
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground truncate"
                onClick={() => props.onNavigate(index() + 1)}
              >
                {segment}
              </button>
            </Show>
          </>
        )}
      </For>
    </div>
  );
}

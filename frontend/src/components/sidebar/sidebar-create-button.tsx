import { type JSX } from 'solid-js';
import { Plus } from '~/components/icons';

export function SidebarCreateButton(props: {
  title: string;
  renderCreate: (renderTrigger: (triggerProps: Record<string, unknown>) => JSX.Element) => JSX.Element;
}) {
  return (
    <span class="contents" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {props.renderCreate((triggerProps) => (
        <button
          {...triggerProps}
          class="opacity-0 group-hover/wsrow:opacity-100 data-[expanded]:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-accent"
          title={props.title}
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      ))}
    </span>
  );
}

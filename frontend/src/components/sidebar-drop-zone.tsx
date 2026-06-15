import { type JSX } from 'solid-js';
import { useDroppable } from '@dnd-kit/solid';
import { DndType, DROP_ZONE_PRIORITY, PUBLIC_ID } from '~/lib/sidebar-dnd';

export default function SidebarDropZone(props: { workspaceId: string | null; children: JSX.Element }) {
  const droppable = useDroppable({
    get id() {
      return props.workspaceId ?? PUBLIC_ID;
    },
    accept: DndType.Project,
    collisionPriority: DROP_ZONE_PRIORITY,
    get data() {
      return { workspaceId: props.workspaceId };
    },
  });

  return (
    <div
      ref={droppable.ref}
      class="flex flex-col gap-0.5 pl-2 min-h-7 rounded-md transition-colors"
      classList={{ 'bg-sidebar-accent/40': droppable.isDropTarget() }}
    >
      {props.children}
    </div>
  );
}

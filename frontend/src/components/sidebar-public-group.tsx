import { For, Show } from 'solid-js';
import { type Project } from '~/api/client';
import { PUBLIC_ID } from '~/lib/sidebar-dnd';
import { ChevronDown, ChevronRight, Globe, Plus } from '~/components/icons';
import SidebarDraggableProjectRow from './sidebar-draggable-project-row';
import SidebarDropZone from './sidebar-drop-zone';

export default function SidebarPublicGroup(props: {
  expanded: boolean;
  projects: Project[];
  activeProjectId: string | undefined;
  creating: boolean;
  canCreate: boolean;
  onToggleFold: () => void;
  onCreate: () => void;
  onSelectProject: (id: string) => void;
  onRenameProject: (id: string, title: string) => void;
  onProjectSettings: (id: string) => void;
  onProjectDeleted: (id: string) => void;
}) {
  return (
    <div class="flex flex-col mt-2">
      <div
        class="group/wsrow flex items-center gap-1.5 pl-4 pr-1 py-1 rounded-md hover:bg-sidebar-accent/50 cursor-pointer"
        onClick={props.onToggleFold}
      >
        <span class="text-muted-foreground shrink-0">
          {props.expanded ? <ChevronDown class="w-3 h-3" /> : <ChevronRight class="w-3 h-3" />}
        </span>
        <Globe class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span class="flex-1 min-w-0 text-sm font-medium truncate text-muted-foreground">Public</span>
        <Show when={props.canCreate}>
          <button
            class="opacity-0 group-hover/wsrow:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              props.onCreate();
            }}
            disabled={props.creating}
            title="New public project"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </Show>
      </div>

      <Show when={props.expanded}>
        <SidebarDropZone workspaceId={null}>
          <Show
            when={props.projects.length > 0}
            fallback={<p class="text-xs text-muted-foreground/50 py-1 px-2 italic">No public projects yet.</p>}
          >
            <For each={props.projects}>
              {(project, idx) => (
                <SidebarDraggableProjectRow
                  project={project}
                  index={idx()}
                  groupId={PUBLIC_ID}
                  isActive={project.id === props.activeProjectId}
                  onSelect={() => props.onSelectProject(project.id)}
                  onRename={(id, title) => props.onRenameProject(id, title)}
                  onSettings={() => props.onProjectSettings(project.id)}
                  onDeleted={() => props.onProjectDeleted(project.id)}
                />
              )}
            </For>
          </Show>
        </SidebarDropZone>
      </Show>
    </div>
  );
}

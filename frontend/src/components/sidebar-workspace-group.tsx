import { For, Show } from "solid-js"
import { useSortable } from "@dnd-kit/solid/sortable"
import { type Project, type Workspace } from "~/api/client"
import { DndType } from "~/lib/sidebar-dnd"
import SidebarDropZone from "./sidebar-drop-zone"
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  GripVertical,
  Lock,
  Plus,
  Settings,
} from "~/components/icons"
import SidebarDraggableProjectRow from "./sidebar-draggable-project-row"

export default function SidebarWorkspaceGroup(props: {
  workspace: Workspace
  index: number
  expanded: boolean
  projects: Project[]
  activeProjectId: string | undefined
  creating: boolean
  onToggleFold: () => void
  onOpenSettings?: () => void
  onCreate: () => void
  onSelectProject: (id: string) => void
  onRenameProject: (id: string, title: string) => void
  onProjectSettings: (id: string) => void
  onProjectDeleted: (id: string) => void
  onProjectDuplicated: (p: Project) => void
}) {
  const sortable = useSortable({
    get id() {
      return `ws:${props.workspace.id}`
    },
    get index() {
      return props.index
    },
    group: "workspaces",
    type: DndType.Workspace,
    accept: DndType.Workspace,
    get data() {
      return { workspaceId: props.workspace.id }
    },
  })

  return (
    <div
      ref={sortable.ref}
      class="flex flex-col"
      style={{ opacity: sortable.isDragging() ? 0.5 : 1 }}
    >
      <div
        class="group/wsrow relative flex items-center gap-1.5 pl-4 pr-1 py-1 rounded-md hover:bg-sidebar-accent/50 cursor-pointer"
        onClick={props.onToggleFold}
      >
        <button
          ref={sortable.handleRef}
          class="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/wsrow:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
        >
          <GripVertical class="w-3 h-3" />
        </button>
        <span class="text-muted-foreground shrink-0">
          {props.expanded ? (
            <ChevronDown class="w-3 h-3" />
          ) : (
            <ChevronRight class="w-3 h-3" />
          )}
        </span>
        <Show
          when={props.workspace.type === "private"}
          fallback={<FolderKanban class="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        >
          <Lock class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </Show>
        <span class="flex-1 min-w-0 text-sm font-medium truncate text-foreground">
          {props.workspace.name}
        </span>
        <Show when={props.onOpenSettings}>
          <button
            class="opacity-0 group-hover/wsrow:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              props.onOpenSettings?.()
            }}
            title="Workspace settings"
          >
            <Settings class="w-3.5 h-3.5" />
          </button>
        </Show>
        <button
          class="opacity-0 group-hover/wsrow:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation()
            props.onCreate()
          }}
          disabled={props.creating}
          title="New project in this workspace"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <Show when={props.expanded}>
        <SidebarDropZone workspaceId={props.workspace.id}>
          <Show
            when={props.projects.length > 0}
            fallback={
              <p class="text-xs text-muted-foreground/50 py-1 px-2 italic">No projects yet.</p>
            }
          >
            <For each={props.projects}>
              {(project, idx) => (
                <SidebarDraggableProjectRow
                  project={project}
                  index={idx()}
                  groupId={props.workspace.id}
                  isActive={project.id === props.activeProjectId}
                  onSelect={() => props.onSelectProject(project.id)}
                  onRename={(id, title) => props.onRenameProject(id, title)}
                  onSettings={() => props.onProjectSettings(project.id)}
                  onDeleted={() => props.onProjectDeleted(project.id)}
                  onDuplicated={(p) => props.onProjectDuplicated(p)}
                />
              )}
            </For>
          </Show>
        </SidebarDropZone>
      </Show>
    </div>
  )
}

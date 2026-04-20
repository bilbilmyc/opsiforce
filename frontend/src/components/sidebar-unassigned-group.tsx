import { For, Show } from "solid-js"
import { type Project } from "~/api/client"
import { UNASSIGNED_ID } from "~/lib/sidebar-dnd"
import { ChevronDown, ChevronRight, Inbox, Plus } from "~/components/icons"
import SidebarDraggableProjectRow from "./sidebar-draggable-project-row"

/** Bucket for projects with no workspace — visible to everyone. */
export default function SidebarUnassignedGroup(props: {
  expanded: boolean
  projects: Project[]
  activeProjectId: string | undefined
  creating: boolean
  onToggleFold: () => void
  onCreate: () => void
  onSelectProject: (id: string) => void
  onRenameProject: (id: string, title: string) => void
  onProjectSettings: (id: string) => void
  onProjectDeleted: (id: string) => void
  onProjectDuplicated: (p: Project) => void
}) {
  return (
    <div class="flex flex-col mt-2">
      <div
        class="group/wsrow flex items-center gap-1.5 pl-4 pr-1 py-1 rounded-md hover:bg-sidebar-accent/50 cursor-pointer"
        onClick={props.onToggleFold}
      >
        <span class="text-muted-foreground shrink-0">
          {props.expanded ? (
            <ChevronDown class="w-3 h-3" />
          ) : (
            <ChevronRight class="w-3 h-3" />
          )}
        </span>
        <Inbox class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span class="flex-1 min-w-0 text-sm font-medium truncate text-muted-foreground">
          Unassigned
        </span>
        <button
          class="opacity-0 group-hover/wsrow:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation()
            props.onCreate()
          }}
          disabled={props.creating}
          title="New unassigned project"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <Show when={props.expanded}>
        <div class="flex flex-col gap-0.5 pl-2">
          <For each={props.projects}>
            {(project, idx) => (
              <SidebarDraggableProjectRow
                project={project}
                index={idx()}
                groupId={UNASSIGNED_ID}
                isActive={project.id === props.activeProjectId}
                draggable={true}
                onSelect={() => props.onSelectProject(project.id)}
                onRename={(id, title) => props.onRenameProject(id, title)}
                onSettings={() => props.onProjectSettings(project.id)}
                onDeleted={() => props.onProjectDeleted(project.id)}
                onDuplicated={(p) => props.onProjectDuplicated(p)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

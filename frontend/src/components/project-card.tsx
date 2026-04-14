import { Show, createSignal } from "solid-js"
import type { Project } from "~/api/client"
import { cn } from "~/lib/cn"
import ProjectActionsMenu from "./project-actions-menu"

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ProjectCard(props: {
  project: Project
  isActive: boolean
  onSelect: () => void
  onRename: (id: string, title: string) => void
  onDeleted?: () => void
  onDuplicated?: (project: Project) => void
}) {
  const isDisabled = () => props.project.status === "disabled"

  const [editing, setEditing] = createSignal(false)
  const [editValue, setEditValue] = createSignal("")

  const title = () =>
    props.project.title ?? new Date(props.project.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  function startRename() {
    setEditValue(props.project.title ?? "")
    setEditing(true)
  }

  function commitRename() {
    const val = editValue().trim()
    if (val && val !== props.project.title) {
      props.onRename(props.project.id, val)
    }
    setEditing(false)
  }

  function cancelRename() {
    setEditing(false)
  }

  return (
    <div
      onClick={() => !editing() && props.onSelect()}
      class={cn(
        "w-full text-left rounded-lg px-2.5 py-2 transition-all duration-150 group relative cursor-pointer",
        props.isActive
          ? "bg-background shadow-sm ring-1 ring-black/[0.04]"
          : "hover:bg-sidebar-accent/60",
      )}
    >
      <div class="flex items-center gap-2 min-w-0">
        <div class="flex-1 min-w-0">
          <Show
            when={!editing()}
            fallback={
              <input
                ref={(el) => setTimeout(() => el.focus(), 0)}
                value={editValue()}
                onInput={(e) => setEditValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename()
                  if (e.key === "Escape") cancelRename()
                }}
                onBlur={commitRename}
                onClick={(e) => e.stopPropagation()}
                class="w-full text-xs font-medium text-sidebar-foreground bg-background border border-input rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring"
              />
            }
          >
            <span class={cn("block text-xs font-medium truncate leading-tight", isDisabled() ? "text-sidebar-muted-foreground" : "text-sidebar-foreground")}>{title()}</span>
          </Show>
          <Show when={props.project.createdAt && !editing()}>
            <span class="block text-xs text-sidebar-muted-foreground mt-0.5">
              {isDisabled() ? "Disabled" : formatRelativeTime(props.project.createdAt)}
            </span>
          </Show>
        </div>

        <Show when={!editing()}>
          <ProjectActionsMenu
            projectId={props.project.id}
            status={props.project.status}
            showRename
            onRename={startRename}
            onDeleted={props.onDeleted}
            onDuplicated={props.onDuplicated}
            triggerClass={cn(
              "inline-flex items-center justify-center rounded-md w-6 h-6 shrink-0 text-sidebar-muted-foreground transition-colors",
              "opacity-0 group-hover:opacity-100",
              "hover:text-sidebar-foreground hover:bg-sidebar-accent",
              props.isActive && "opacity-100",
            )}
            onTriggerClick={(e) => e.stopPropagation()}
          />
        </Show>
      </div>
    </div>
  )
}

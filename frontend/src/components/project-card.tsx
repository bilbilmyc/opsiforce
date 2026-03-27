import { Show, createSignal } from "solid-js"
import type { Project } from "~/api/client"
import { cn } from "~/lib/cn"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu"

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
  onDelete: (id: string) => void
}) {
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
          ? "bg-sidebar-accent"
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
            <span class="block text-xs font-medium text-sidebar-foreground truncate">{title()}</span>
          </Show>
          <Show when={props.project.createdAt && !editing()}>
            <span class="block text-xs text-sidebar-muted-foreground mt-0.5">
              {formatRelativeTime(props.project.createdAt)}
            </span>
          </Show>
        </div>

        <Show when={!editing()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              class={cn(
                "inline-flex items-center justify-center rounded-md w-6 h-6 shrink-0 text-sidebar-muted-foreground transition-colors",
                "opacity-0 group-hover:opacity-100",
                "hover:text-sidebar-foreground hover:bg-sidebar-accent",
                props.isActive && "opacity-100",
              )}
              onClick={(e: MouseEvent) => e.stopPropagation()}
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={startRename}>
                <svg class="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-destructive data-[highlighted]:text-destructive" onSelect={() => props.onDelete(props.project.id)}>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Show>
      </div>
    </div>
  )
}

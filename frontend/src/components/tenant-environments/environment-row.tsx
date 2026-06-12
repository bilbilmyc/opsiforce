import { Show, createSignal } from "solid-js"
import { toast } from "solid-sonner"
import { Lock, Pencil, Trash2, X } from "~/components/icons"
import { Button } from "~/components/ui/button"
import { useUpdateEnvironment, type Environment } from "~/api/environments"

export interface EnvironmentRowProps {
  environment: Environment
  onRequestDelete: (environment: Environment) => void
}

export default function EnvironmentRow(props: EnvironmentRowProps) {
  const update = useUpdateEnvironment()
  const [editing, setEditing] = createSignal(false)
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")

  const isLocked = () => props.environment.isProtected

  const startEdit = () => {
    setName(props.environment.name)
    setDescription(props.environment.description ?? "")
    setEditing(true)
  }

  const save = async () => {
    const trimmed = name().trim()
    if (!trimmed) return
    try {
      await update.mutateAsync({
        id: props.environment.id,
        dto: { name: trimmed, description: description().trim() },
      })
      toast.success("Environment updated")
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update environment")
    }
  }

  return (
    <div class="rounded-md border border-border bg-background p-2.5">
      <Show
        when={editing()}
        fallback={
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-medium text-foreground">{props.environment.name}</span>
                <span
                  class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                  title="URL slug — appears in every app URL of this environment"
                >
                  {props.environment.slug}
                </span>
                <Show when={isLocked()}>
                  <span class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Lock class="h-2.5 w-2.5" />
                    Protected
                  </span>
                </Show>
              </div>
              <Show when={props.environment.description}>
                {(description) => (
                  <p class="mt-0.5 truncate text-xs text-muted-foreground">{description()}</p>
                )}
              </Show>
            </div>
            <Show when={!isLocked()}>
              <div class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={startEdit}
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Edit"
                  aria-label="Edit environment"
                >
                  <Pencil class="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => props.onRequestDelete(props.environment)}
                  class="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Delete"
                  aria-label="Delete environment"
                >
                  <Trash2 class="h-3 w-3" />
                </button>
              </div>
            </Show>
          </div>
        }
      >
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-foreground">Edit environment</span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              class="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Cancel"
            >
              <X class="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name().trim()) save()
            }}
            class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Name"
            autofocus
          />
          <input
            type="text"
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Description (optional)"
          />
          <div class="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={save}
              loading={update.isPending}
              disabled={!name().trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </Show>
    </div>
  )
}

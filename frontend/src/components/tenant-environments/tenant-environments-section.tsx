import { For, Show, createSignal } from "solid-js"
import { toast } from "solid-sonner"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import {
  useCreateEnvironment,
  useDeleteEnvironment,
  useEnvironments,
  type Environment,
} from "~/api/environments"
import { Button } from "~/components/ui/button"
import ConfirmDialog from "~/components/ui/confirm-dialog"
import Skeleton from "~/components/ui/skeleton"
import { Plus } from "~/components/icons"
import EnvironmentRow from "./environment-row"

export default function TenantEnvironmentsSection(props: { active: boolean }) {
  const { hasPermission } = usePermissions()
  const canManage = () => hasPermission(Permission.manageEnvironments)

  const environments = useEnvironments({ enabled: () => props.active && canManage() })
  const create = useCreateEnvironment()
  const remove = useDeleteEnvironment()

  const [creating, setCreating] = createSignal(false)
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [pendingDelete, setPendingDelete] = createSignal<Environment | null>(null)

  const resetForm = () => {
    setName("")
    setDescription("")
    setCreating(false)
  }

  const submitCreate = async () => {
    const trimmed = name().trim()
    if (!trimmed) return
    try {
      await create.mutateAsync({ name: trimmed, description: description().trim() || undefined })
      toast.success("Environment created")
      resetForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create environment")
    }
  }

  const confirmDelete = () => {
    const env = pendingDelete()
    if (!env) return
    remove.mutate(env.id, {
      onSuccess: () => toast.success(`${env.name} deleted`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete environment"),
    })
  }

  return (
    <Show
      when={canManage()}
      fallback={
        <div class="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-center">
          <p class="text-sm text-muted-foreground">
            You do not have permission to manage environments.
          </p>
        </div>
      }
    >
      <div class="mt-4 space-y-3">
        <p class="text-xs text-muted-foreground">
          Environments are the publish targets offered to every project in this tenant.
          Development is always available and cannot be changed.
        </p>

        <div class="space-y-2">
          <Show
            when={!environments.isPending}
            fallback={
              <div class="space-y-2">
                <Skeleton class="h-12 w-full" />
                <Skeleton class="h-12 w-full" />
              </div>
            }
          >
            <For each={environments.data}>
              {(env) => <EnvironmentRow environment={env} onRequestDelete={setPendingDelete} />}
            </For>
          </Show>
        </div>

        <Show
          when={creating()}
          fallback={
            <Button size="sm" variant="outline" class="w-full" onClick={() => setCreating(true)}>
              <Plus class="h-3.5 w-3.5" />
              Add environment
            </Button>
          }
        >
          <div class="space-y-2 rounded-md border border-dashed border-border p-2.5">
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name().trim()) submitCreate()
              }}
              class="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Production"
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
              <Button size="sm" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
              <Button size="sm" onClick={submitCreate} loading={create.isPending} disabled={!name().trim()}>
                Create
              </Button>
            </div>
          </div>
        </Show>
      </div>

      <ConfirmDialog
        open={pendingDelete() !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete environment"
        description={`This deletes the ${pendingDelete()?.name ?? ""} environment from the tenant. Projects can no longer publish to it. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </Show>
  )
}

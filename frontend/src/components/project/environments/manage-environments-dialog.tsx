import { For, Show, createSignal } from "solid-js"
import { toast } from "solid-sonner"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import {
  useDeleteProjectEnvironment,
  useProjectEnvironments,
  useRestartProjectEnvironment,
  type ProjectEnvironment,
} from "~/api/environments"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import ConfirmDialog from "~/components/ui/confirm-dialog"
import Skeleton from "~/components/ui/skeleton"
import EnvManageRow from "./env-manage-row"

export interface ManageEnvironmentsDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnvironmentDeleted?: (environmentId: string) => void
}

export default function ManageEnvironmentsDialog(props: ManageEnvironmentsDialogProps) {
  const { hasPermission } = usePermissions()
  const canRestart = () => hasPermission(Permission.restartProject)
  const canDelete = () => hasPermission(Permission.deleteEnvironment)

  const environments = useProjectEnvironments(() => props.projectId, {
    enabled: () => props.open,
  })
  const restart = useRestartProjectEnvironment()
  const remove = useDeleteProjectEnvironment()

  const [pendingDelete, setPendingDelete] = createSignal<ProjectEnvironment | null>(null)
  const [pendingRestart, setPendingRestart] = createSignal<ProjectEnvironment | null>(null)
  const [restartingId, setRestartingId] = createSignal<string | null>(null)

  const confirmRestart = () => {
    const env = pendingRestart()
    if (!env) return
    setRestartingId(env.id)
    restart.mutate(
      { projectId: props.projectId, environmentId: env.id },
      {
        onSuccess: () => toast.success(`Restarting ${env.name}`),
        onError: () => toast.error(`Failed to restart ${env.name}`),
        onSettled: () => setRestartingId(null),
      },
    )
  }

  const confirmDelete = () => {
    const env = pendingDelete()
    if (!env) return
    remove.mutate(
      { projectId: props.projectId, environmentId: env.id },
      {
        onSuccess: () => {
          toast.success(`${env.name} deleted`)
          props.onEnvironmentDeleted?.(env.id)
        },
        onError: () => toast.error(`Failed to delete ${env.name}`),
      },
    )
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-lg">
        <DialogTitle>Environments</DialogTitle>
        <DialogDescription>
          The environments this app runs in. Open a surface, restart, or remove a published
          environment.
        </DialogDescription>

        <div class="mt-4 space-y-2">
          <Show
            when={!environments.isPending}
            fallback={
              <div class="space-y-2">
                <Skeleton class="h-24 w-full" />
                <Skeleton class="h-24 w-full" />
              </div>
            }
          >
            <For each={environments.data}>
              {(env) => (
                <EnvManageRow
                  environment={env}
                  canRestart={canRestart() && env.status !== "disabled"}
                  canDelete={canDelete()}
                  restarting={restartingId() === env.id}
                  onRestart={() => setPendingRestart(env)}
                  onDelete={() => setPendingDelete(env)}
                />
              )}
            </For>
          </Show>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={pendingRestart() !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRestart(null)
        }}
        title="Restart environment"
        description={`Are you sure you want to restart the ${pendingRestart()?.name ?? ""} environment? The running app will briefly go offline while it restarts.`}
        confirmLabel="Restart"
        variant="destructive"
        onConfirm={confirmRestart}
      />

      <ConfirmDialog
        open={pendingDelete() !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete environment"
        description={`This permanently deletes the ${pendingDelete()?.name ?? ""} environment and its running app. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </Dialog>
  )
}

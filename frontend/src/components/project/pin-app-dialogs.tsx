import { toast } from "solid-sonner"
import { useSetAppPin } from "~/api/projects"
import { useTenantSettings } from "~/api/tenant-settings"
import ConfirmDialog from "~/components/ui/confirm-dialog"

export type PinDialogAction = "pin" | "unpin" | null

export interface PinAppDialogsProps {
  projectId: string
  action: PinDialogAction
  onActionChange: (action: PinDialogAction) => void
}

export default function PinAppDialogs(props: PinAppDialogsProps) {
  const setAppPin = useSetAppPin()
  const tenantSettings = useTenantSettings()

  const close = () => props.onActionChange(null)

  const makaraTenantLabel = () => {
    const name = tenantSettings.data?.makaraTenantName
    return name ? `Makara tenant ${name}` : "your mapped Makara tenant"
  }

  return (
    <>
      <ConfirmDialog
        open={props.action === "pin"}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title="Pin to Makara"
        description={`This will make this app visible to all users in ${makaraTenantLabel()} who have the Apps permission in Makara. Continue?`}
        confirmLabel="Pin"
        onConfirm={() =>
          setAppPin.mutate(
            { projectId: props.projectId, isPinned: true },
            {
              onSuccess: () => toast.success("App pinned to Makara"),
              onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to pin"),
            },
          )
        }
      />
      <ConfirmDialog
        open={props.action === "unpin"}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title="Unpin from Makara"
        description={`This will remove the app from Makara's side panel for everyone in ${makaraTenantLabel()}. Continue?`}
        confirmLabel="Unpin"
        variant="destructive"
        onConfirm={() =>
          setAppPin.mutate(
            { projectId: props.projectId, isPinned: false },
            {
              onSuccess: () => toast.success("App unpinned from Makara"),
              onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to unpin"),
            },
          )
        }
      />
    </>
  )
}

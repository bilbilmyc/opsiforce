import { toast } from "solid-sonner"
import { usePinApp, useUnpinApp } from "~/api/projects"
import type { Project } from "~/api/client"
import ConfirmDialog from "~/components/ui/confirm-dialog"

export type PinDialogAction = "pin" | "unpin" | null

export interface PinAppDialogsProps {
  projectId: string
  authMode: Project["authMode"] | undefined
  action: PinDialogAction
  onActionChange: (action: PinDialogAction) => void
}

export default function PinAppDialogs(props: PinAppDialogsProps) {
  const pinApp = usePinApp()
  const unpinApp = useUnpinApp()
  const hasCompatibleAuthMode = () => props.authMode === "public" || props.authMode === "makara"

  const close = () => props.onActionChange(null)

  return (
    <>
      <ConfirmDialog
        open={props.action === "pin"}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title="Pin to Makara"
        description={
          hasCompatibleAuthMode()
            ? "This will make this app visible to all users in your tenant who have the Apps permission in Makara. Continue?"
            : "This project's auth mode must be 'public' or 'makara' before it can be pinned. Open project Settings → Auth to change the mode first."
        }
        confirmLabel="Pin"
        onConfirm={() => {
          if (!hasCompatibleAuthMode()) {
            toast.error("Set auth mode to public or makara before pinning")
            return
          }
          pinApp.mutate(props.projectId, {
            onSuccess: () => toast.success("App pinned to Makara"),
            onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to pin"),
          })
        }}
      />
      <ConfirmDialog
        open={props.action === "unpin"}
        onOpenChange={(open) => {
          if (!open) close()
        }}
        title="Unpin from Makara"
        description="This will remove the app from Makara's side panel for everyone in your tenant. Continue?"
        confirmLabel="Unpin"
        variant="destructive"
        onConfirm={() =>
          unpinApp.mutate(props.projectId, {
            onSuccess: () => toast.success("App unpinned from Makara"),
            onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to unpin"),
          })
        }
      />
    </>
  )
}

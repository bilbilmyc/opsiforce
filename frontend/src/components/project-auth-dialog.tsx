import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/dialog"
import { ProjectAuthTab } from "~/components/project-auth"

export default function ProjectAuthDialog(props: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="max-w-2xl">
        <DialogTitle>App Auth</DialogTitle>
        <DialogDescription>Configure how visitors sign in to your app.</DialogDescription>
        <div class="mt-4">
          <ProjectAuthTab projectId={props.projectId} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

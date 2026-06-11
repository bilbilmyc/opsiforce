import { Show } from "solid-js"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import Skeleton from "~/components/ui/skeleton"
import { ExternalLink, Rocket } from "~/components/icons"
import PublishProgress from "./publish-progress"
import type { TrackedPublish } from "./publish-jobs-context"

export interface PublishProgressDialogProps {
  entry: TrackedPublish
  onMinimize: () => void
  onDismiss: () => void
}

export default function PublishProgressDialog(props: PublishProgressDialogProps) {
  const job = () => props.entry.job
  const isTerminal = () => {
    const status = job()?.status
    return status === "done" || status === "failed"
  }
  const appUrl = () => {
    const current = job()
    if (!current || current.status !== "done") return null
    return `https://${current.projectEnvironmentId}.${import.meta.env.VITE_WEBAPP_DOMAIN}/`
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onMinimize()
      }}
    >
      <DialogContent class="max-w-lg">
        <DialogTitle class="flex items-center gap-2">
          <Rocket class="h-4 w-4 text-primary" />
          Publishing to {props.entry.environmentName}
        </DialogTitle>
        <DialogDescription>
          Closing this dialog keeps the publish running; a progress card stays in the corner.
        </DialogDescription>

        <Show when={job()} fallback={<Skeleton class="mt-4 h-40 w-full" />}>
          {(j) => <PublishProgress job={j()} environmentName={props.entry.environmentName} />}
        </Show>

        <div class="mt-5 flex justify-end gap-2">
          <Show when={appUrl()}>
            {(url) => (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(url(), "_blank", "noopener,noreferrer")}
              >
                <ExternalLink class="h-3.5 w-3.5" />
                Open app
              </Button>
            )}
          </Show>
          <Show
            when={isTerminal()}
            fallback={
              <Button size="sm" variant="outline" onClick={() => props.onMinimize()}>
                Minimize
              </Button>
            }
          >
            <Button size="sm" onClick={() => props.onDismiss()}>
              Done
            </Button>
          </Show>
        </div>
      </DialogContent>
    </Dialog>
  )
}

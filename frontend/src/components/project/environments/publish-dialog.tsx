import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { toast } from "solid-sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import ConfirmDialog from "~/components/ui/confirm-dialog"
import Skeleton from "~/components/ui/skeleton"
import { GitBranch, Rocket } from "~/components/icons"
import { usePublish, usePublishForm, type PublishTarget } from "~/api/publish"
import { useProjects } from "~/api/projects"
import { usePublishJobs } from "./publish-jobs-context"

export interface PublishDialogProps {
  projectId: string
  target: PublishTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function PublishDialog(props: PublishDialogProps) {
  const projectId = () => props.projectId
  const targetId = () => props.target?.environmentId ?? null
  const targetName = () => props.target?.name ?? "this environment"

  const [variables, setVariables] = createSignal<Record<string, string>>({})
  const [scheduleSelection, setScheduleSelection] = createSignal<Record<string, boolean>>({})
  const [confirmOpen, setConfirmOpen] = createSignal(false)

  const projects = useProjects({ enabled: () => props.open })
  const devAuthIsManual = () =>
    projects.data?.find((p) => p.id === props.projectId)?.authMode === "manual"

  const form = usePublishForm(projectId, targetId, { enabled: () => props.open })
  const publish = usePublish()
  const publishJobs = usePublishJobs()

  createEffect(() => {
    const data = form.data
    if (!data) return
    if (data.environmentId !== targetId()) return
    setVariables(Object.fromEntries(data.variables.map((v) => [v.key, v.value])))
    setScheduleSelection(Object.fromEntries(data.schedules.map((s) => [s.id, s.selected])))
  })

  const close = () => {
    props.onOpenChange(false)
    setTimeout(() => {
      setVariables({})
      setScheduleSelection({})
      setConfirmOpen(false)
    }, 200)
  }

  const isFirstPublish = createMemo(() => form.data?.isFirstPublish ?? !props.target?.projectEnvironmentId)

  const submitLabel = () => (isFirstPublish() ? "Publish" : "Publish update")

  const runPublish = async () => {
    const id = targetId()
    const target = props.target
    if (!id || !target) return
    const selectedScheduleIds = Object.entries(scheduleSelection())
      .filter(([, on]) => on)
      .map(([scheduleId]) => scheduleId)
    try {
      await publish.mutateAsync({
        projectId: projectId(),
        dto: { environmentId: id, variables: variables(), scheduleIds: selectedScheduleIds },
      })
      publishJobs.start({ environmentId: id, environmentName: target.name })
      close()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start publish")
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent class="max-w-lg">
        <DialogTitle class="flex items-center gap-2">
          <Rocket class="h-4 w-4 text-primary" />
          {isFirstPublish() ? `Publish to ${targetName()}` : `Publish update to ${targetName()}`}
        </DialogTitle>
        <DialogDescription>
          {isFirstPublish()
            ? `Build the Development app and run it in ${targetName()}.`
            : `Build the Development app and update the one running in ${targetName()}.`}
        </DialogDescription>

        <div class="mt-4 space-y-4">
          <Show when={devAuthIsManual()}>
            <p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Development uses manual OIDC auth, which the new environment inherits. After
              publishing, register the new environment's callback URL (shown in its Auth dialog)
              with your identity provider, or sign-in there will fail.
            </p>
          </Show>

          <Show when={targetId()}>
            <Show when={!form.isPending} fallback={<Skeleton class="h-24 w-full" />}>
              <Show when={form.data}>
                {(data) => (
                  <>
                    <Show when={data().variables.length > 0}>
                      <div class="space-y-2">
                        <label class="block text-xs font-medium text-foreground">
                          Environment variables
                        </label>
                        <div class="space-y-2">
                          <For each={data().variables}>
                            {(variable) => (
                              <div class="flex items-center gap-2">
                                <code class="w-2/5 shrink-0 truncate rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                                  {variable.key}
                                </code>
                                <input
                                  type="text"
                                  value={variables()[variable.key] ?? ""}
                                  onInput={(e) =>
                                    setVariables((prev) => ({
                                      ...prev,
                                      [variable.key]: e.currentTarget.value,
                                    }))
                                  }
                                  class="h-8 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  placeholder="value"
                                />
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={data().schedules.length > 0}>
                      <div class="space-y-2">
                        <label class="block text-xs font-medium text-foreground">Schedules</label>
                        <p class="text-xs text-muted-foreground">
                          Choose which schedules run in this environment.
                        </p>
                        <div class="space-y-1">
                          <For each={data().schedules}>
                            {(schedule) => (
                              <label class="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-2.5 py-2 transition-colors hover:bg-accent/50">
                                <input
                                  type="checkbox"
                                  checked={scheduleSelection()[schedule.id] ?? false}
                                  onChange={(e) =>
                                    setScheduleSelection((prev) => ({
                                      ...prev,
                                      [schedule.id]: e.currentTarget.checked,
                                    }))
                                  }
                                  class="h-3.5 w-3.5 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                                <span class="truncate text-xs text-foreground">{schedule.name}</span>
                              </label>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>

                    <Show when={data().variables.length === 0 && data().schedules.length === 0}>
                      <p class="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                        No variables or schedules to configure.{" "}
                        {data().isFirstPublish
                          ? "This is the first publish to this environment."
                          : "Publishing again updates the running app."}
                      </p>
                    </Show>
                  </>
                )}
              </Show>
            </Show>
          </Show>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            loading={publish.isPending}
            disabled={!targetId() || form.isPending}
          >
            <GitBranch class="h-3.5 w-3.5" />
            {submitLabel()}
          </Button>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen()}
        onOpenChange={setConfirmOpen}
        title={isFirstPublish() ? `Publish to ${targetName()}?` : `Publish update to ${targetName()}?`}
        description={
          isFirstPublish()
            ? `This builds the Development app and starts it in ${targetName()}.`
            : `${targetName()} is currently live. The update replaces the running app with a fresh build. The deploy happens in place and only swaps on success.`
        }
        confirmLabel={submitLabel()}
        variant={isFirstPublish() ? "default" : "destructive"}
        onConfirm={runPublish}
      />
    </Dialog>
  )
}

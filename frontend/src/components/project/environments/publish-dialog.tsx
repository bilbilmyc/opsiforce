import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { toast } from "solid-sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import ConfirmDialog from "~/components/ui/confirm-dialog"
import Skeleton from "~/components/ui/skeleton"
import { GitBranch, Rocket } from "~/components/icons"
import {
  usePublish,
  usePublishForm,
  usePublishJob,
  usePublishTargets,
  type PublishTarget,
} from "~/api/publish"
import { useProjects } from "~/api/projects"
import EnvStatusDot from "./env-status-dot"
import PublishProgress from "./publish-progress"

export interface PublishDialogProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialEnvironmentId?: string | null
}

export default function PublishDialog(props: PublishDialogProps) {
  const projectId = () => props.projectId
  const [targetId, setTargetId] = createSignal<string | null>(null)
  const [variables, setVariables] = createSignal<Record<string, string>>({})
  const [scheduleSelection, setScheduleSelection] = createSignal<Record<string, boolean>>({})
  const [confirmOpen, setConfirmOpen] = createSignal(false)
  const [publishedEnvId, setPublishedEnvId] = createSignal<string | null>(null)

  const targets = usePublishTargets(projectId, { enabled: () => props.open })
  const projects = useProjects({ enabled: () => props.open })
  const devAuthIsManual = () =>
    projects.data?.find((p) => p.id === props.projectId)?.authMode === "manual"
  const selectedTarget = createMemo(() =>
    (targets.data ?? []).find((t) => t.environmentId === targetId()),
  )

  const form = usePublishForm(projectId, targetId, { enabled: () => props.open })
  const publish = usePublish()
  const job = usePublishJob(projectId, publishedEnvId, { enabled: () => props.open })

  const inProgress = () => publishedEnvId() !== null

  createEffect(() => {
    if (!props.open) return
    const targetList = targets.data
    if (!targetList || targetList.length === 0) return
    if (targetId()) return
    const preferred =
      (props.initialEnvironmentId &&
        targetList.find((t) => t.environmentId === props.initialEnvironmentId)) ||
      targetList[0]
    setTargetId(preferred.environmentId)
  })

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
      setTargetId(null)
      setVariables({})
      setScheduleSelection({})
      setPublishedEnvId(null)
      setConfirmOpen(false)
    }, 200)
  }

  const targetActionLabel = (target: PublishTarget) =>
    target.projectEnvironmentId ? "Redeploy" : "Publish"

  const submitLabel = createMemo(() => {
    const target = selectedTarget()
    if (!target) return "Publish"
    return targetActionLabel(target)
  })

  const runPublish = async () => {
    const id = targetId()
    if (!id) return
    const selectedScheduleIds = Object.entries(scheduleSelection())
      .filter(([, on]) => on)
      .map(([scheduleId]) => scheduleId)
    try {
      const result = await publish.mutateAsync({
        projectId: projectId(),
        dto: { environmentId: id, variables: variables(), scheduleIds: selectedScheduleIds },
      })
      setPublishedEnvId(result.environmentId)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start publish")
    }
  }

  const handleSubmit = () => {
    if (selectedTarget()?.status === "active") {
      setConfirmOpen(true)
      return
    }
    runPublish()
  }

  const activeJob = () => job.data ?? undefined

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
          Publish app
        </DialogTitle>
        <DialogDescription>
          Build the Development app and run it in a chosen environment.
        </DialogDescription>

        <Show
          when={!inProgress()}
          fallback={
            <Show
              when={activeJob()}
              fallback={<Skeleton class="mt-4 h-40 w-full" />}
            >
              {(j) => (
                <>
                  <PublishProgress
                    job={j()}
                    environmentName={selectedTarget()?.name ?? form.data?.environmentName ?? "App"}
                  />
                  <div class="mt-5 flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant={
                        j().status === "done" || j().status === "failed" ? "default" : "outline"
                      }
                      onClick={close}
                    >
                      {j().status === "done" || j().status === "failed" ? "Done" : "Close"}
                    </Button>
                  </div>
                </>
              )}
            </Show>
          }
        >
          <div class="mt-4 space-y-4">
            <Show when={devAuthIsManual()}>
              <p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Development uses manual OIDC auth, which the new environment inherits. After
                publishing, register the new environment's callback URL (shown in its Auth dialog)
                with your identity provider, or sign-in there will fail.
              </p>
            </Show>
            <div class="space-y-1.5">
              <label class="block text-xs font-medium text-foreground">Environment</label>
              <Show
                when={!targets.isPending}
                fallback={<Skeleton class="h-8 w-full" />}
              >
                <Show
                  when={(targets.data?.length ?? 0) > 0}
                  fallback={
                    <p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      No publish targets available. Ask an administrator to add an environment.
                    </p>
                  }
                >
                  <Select<PublishTarget>
                    options={targets.data ?? []}
                    optionValue="environmentId"
                    optionTextValue="name"
                    value={selectedTarget()}
                    onChange={(t) => t && setTargetId(t.environmentId)}
                    itemComponent={(itemProps) => (
                      <SelectItem item={itemProps.item} class="gap-2">
                        <span class="flex w-full items-center gap-2">
                          <span class="truncate">{itemProps.item.rawValue.name}</span>
                          <span class="ml-auto flex items-center gap-1.5">
                            <Show when={itemProps.item.rawValue.status}>
                              {(status) => <EnvStatusDot status={status()} />}
                            </Show>
                            <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {targetActionLabel(itemProps.item.rawValue)}
                            </span>
                          </span>
                        </span>
                      </SelectItem>
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue<PublishTarget>>
                        {(state) => (
                          <Show when={state.selectedOption()}>
                            {(t) => (
                              <span class="flex items-center gap-2">
                                <Show when={t().status}>
                                  {(status) => <EnvStatusDot status={status()} />}
                                </Show>
                                <span class="truncate">{t().name}</span>
                              </span>
                            )}
                          </Show>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </Show>
              </Show>
              <Show when={selectedTarget()?.description}>
                {(description) => (
                  <p class="text-xs text-muted-foreground">{description()}</p>
                )}
              </Show>
            </div>

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

                      <Show
                        when={data().variables.length === 0 && data().schedules.length === 0}
                      >
                        <p class="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                          No variables or schedules to configure.{" "}
                          {data().isFirstPublish
                            ? "This is the first publish to this environment."
                            : "The current build will be redeployed."}
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
              onClick={handleSubmit}
              loading={publish.isPending}
              disabled={!targetId() || form.isPending}
            >
              <GitBranch class="h-3.5 w-3.5" />
              {submitLabel()}
            </Button>
          </div>
        </Show>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen()}
        onOpenChange={setConfirmOpen}
        title="Redeploy over the running app?"
        description={`${selectedTarget()?.name ?? "This environment"} is currently live. Redeploying replaces the running app with a fresh build. The deploy happens in place and only swaps on success.`}
        confirmLabel="Redeploy"
        variant="destructive"
        onConfirm={runPublish}
      />
    </Dialog>
  )
}

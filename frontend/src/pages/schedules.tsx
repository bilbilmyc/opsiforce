import { Show, For, createSignal, createMemo, createEffect } from "solid-js"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { Link, useSearch } from "@tanstack/solid-router"
import { scheduleApi, type Schedule, type ScheduleExecution, type UpdateScheduleDto } from "~/api/client"
import {
  Calendar,
  Trash2,
  Pencil,
  Play,
  Clock,
  EllipsisVertical,
} from "~/components/icons"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "~/components/ui/dialog"
import ConfirmDialog from "~/components/ui/confirm-dialog"
import { Badge } from "~/components/ui/badge"
import { CronPicker } from "~/components/ui/cron-picker"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "~/components/ui/table"
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu"

function cronToHuman(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [min, hour, , , dow] = parts
  if (min === "*" && hour === "*") return "Every minute"
  if (min.startsWith("*/")) return `Every ${min.slice(2)} min`
  if (hour === "*") return `Hourly at :${min.padStart(2, "0")}`
  const h = parseInt(hour)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const time = `${h12}:${min.padStart(2, "0")} ${ampm}`
  if (dow === "1-5") return `Weekdays ${time}`
  if (dow !== "*") return `${dow} ${time}`
  return `Daily ${time}`
}

export default function SchedulesPage() {
  const qc = useQueryClient()
  const search = useSearch({ from: "/schedules" })
  const projectFilter = createMemo(() => search().project)

  const [editSchedule, setEditSchedule] = createSignal<Schedule | null>(null)
  const [deleteTarget, setDeleteTarget] = createSignal<Schedule | null>(null)
  const [runTarget, setRunTarget] = createSignal<Schedule | null>(null)
  const [execSchedule, setExecSchedule] = createSignal<Schedule | null>(null)
  const [triggeredId, setTriggeredId] = createSignal<string | null>(null)

  const schedules = createQuery(() => ({
    queryKey: ["schedules", projectFilter()],
    queryFn: () => scheduleApi.list(projectFilter()),
  }))

  const executions = createQuery(() => ({
    queryKey: ["executions", execSchedule()?.id],
    queryFn: () => {
      const s = execSchedule()
      return s ? scheduleApi.getExecutions(s.id, s.projectId) : Promise.resolve([])
    },
    enabled: !!execSchedule(),
  }))

  const removeMutation = createMutation(() => ({
    mutationFn: (s: Schedule) => scheduleApi.remove(s.projectId, s.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] })
      setDeleteTarget(null)
    },
  }))

  const updateMutation = createMutation(() => ({
    mutationFn: (args: { s: Schedule; dto: UpdateScheduleDto }) =>
      scheduleApi.update(args.s.projectId, args.s.id, args.dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] })
      setEditSchedule(null)
    },
  }))

  const runNow = async (s: Schedule) => {
    setTriggeredId(s.id)
    await scheduleApi.triggerRun(s.projectId, s.id)
    setTimeout(() => setTriggeredId(null), 2000)
    qc.invalidateQueries({ queryKey: ["executions", s.id] })
  }

  const toggleActive = (s: Schedule) => {
    updateMutation.mutate({ s, dto: { isActive: !s.isActive } })
  }

  const count = () => schedules.data?.length ?? 0

  return (
    <div class="w-full px-4 py-6">
      <div class="flex items-center gap-3 mb-1">
        <Calendar class="w-5 h-5 text-muted-foreground" />
        <h1 class="text-xl font-semibold">Schedules</h1>
        <Show when={!schedules.isPending}>
          <Badge variant="secondary" class="text-[10px] px-1.5 py-0">
            {count()}
          </Badge>
        </Show>
        <Show when={projectFilter()}>
          <Badge variant="info" class="text-[10px] ml-auto">
            Filtered by project
          </Badge>
        </Show>
      </div>
      <p class="text-xs text-muted-foreground mb-5 ml-8">
        Automated tasks that run on a recurring schedule across your projects.
      </p>

      <Show when={schedules.isPending}>
        <p class="text-sm text-muted-foreground">Loading...</p>
      </Show>

      <Show when={!schedules.isPending && count() === 0}>
        <div class="rounded-lg border border-dashed border-border text-center py-16 text-muted-foreground">
          <Calendar class="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p class="text-sm font-medium">No schedules yet</p>
        </div>
      </Show>

      <Show when={count() > 0}>
        <div class="rounded-lg border border-border overflow-hidden bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Active</TableHead>
                <TableHead class="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={schedules.data}>
                {(s) => (
                  <TableRow>
                    <TableCell class="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: s.projectId }}
                        search={{ prompt: undefined }}
                        class="text-xs text-primary hover:underline underline-offset-2"
                      >
                        {s.projectTitle ?? s.projectId.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span class="text-xs" title={s.cronPattern}>
                        {cronToHuman(s.cronPattern)}
                      </span>
                    </TableCell>
                    <TableCell class="text-xs text-muted-foreground">{s.timeZone}</TableCell>
                    <TableCell>
                      <Switch
                        checked={s.isActive}
                        onChange={() => toggleActive(s)}
                        disabled={updateMutation.isPending}
                      >
                        <SwitchControl>
                          <SwitchThumb />
                        </SwitchControl>
                      </Switch>
                    </TableCell>
                    <TableCell class="text-right pr-2">
                      <RowActions
                        disabled={triggeredId() === s.id}
                        onRun={() => setRunTarget(s)}
                        onViewExecutions={() => setExecSchedule(s)}
                        onEdit={() => setEditSchedule(s)}
                        onDelete={() => setDeleteTarget(s)}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </For>
            </TableBody>
          </Table>
        </div>
      </Show>

      <EditScheduleDialog
        schedule={editSchedule()}
        onClose={() => setEditSchedule(null)}
        onSave={(dto) => {
          const s = editSchedule()
          if (s) updateMutation.mutate({ s, dto })
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget()}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={`Delete schedule "${deleteTarget()?.name}"`}
        description="This will permanently remove the schedule and all its execution history."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          const t = deleteTarget()
          if (t) removeMutation.mutate(t)
        }}
      />

      <ConfirmDialog
        open={!!runTarget()}
        onOpenChange={(open) => { if (!open) setRunTarget(null) }}
        title={`Run "${runTarget()?.name}" now?`}
        description={
          `This triggers the schedule immediately, outside its normal cron window. ` +
          `It will fire ${runTarget()?.targetPath ?? "the configured target"} once and record the run in execution history.`
        }
        confirmLabel="Run now"
        onConfirm={() => {
          const t = runTarget()
          if (t) {
            runNow(t)
            setRunTarget(null)
          }
        }}
      />

      <ExecutionsDialog
        schedule={execSchedule()}
        executions={executions.data ?? []}
        loading={executions.isPending}
        onClose={() => setExecSchedule(null)}
      />
    </div>
  )
}

function RowActions(props: {
  disabled?: boolean
  onRun: () => void
  onViewExecutions: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        class="inline-flex items-center justify-center rounded-md w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        disabled={props.disabled}
        aria-label="Schedule actions"
      >
        <EllipsisVertical class="w-4 h-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={() => props.onRun()}>
          <Play class="w-3.5 h-3.5 text-emerald-600" />
          Run now
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onViewExecutions()}>
          <Clock class="w-3.5 h-3.5 text-muted-foreground" />
          View executions
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => props.onEdit()}>
          <Pencil class="w-3.5 h-3.5 text-blue-600" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          class="text-destructive data-[highlighted]:text-destructive"
          onSelect={() => props.onDelete()}
        >
          <Trash2 class="w-3.5 h-3.5 text-destructive" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EditScheduleDialog(props: {
  schedule: Schedule | null
  onClose: () => void
  onSave: (dto: UpdateScheduleDto) => void
}) {
  const [cron, setCron] = createSignal("")

  const open = createMemo(() => !!props.schedule)

  createEffect(() => {
    const s = props.schedule
    if (s) setCron(s.cronPattern)
  })

  return (
    <Dialog open={open()} onOpenChange={(o) => { if (!o) props.onClose() }} >
      <DialogContent class="max-w-lg">
        <DialogTitle>Edit Schedule: {props.schedule?.name}</DialogTitle>
        <DialogDescription>Change when this schedule runs</DialogDescription>
        <div class="space-y-3 mt-2">
          <CronPicker cronString={cron()} setCronString={setCron} view="advanced" />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => props.onSave({ cronPattern: cron() })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExecutionsDialog(props: {
  schedule: Schedule | null
  executions: ScheduleExecution[]
  loading: boolean
  onClose: () => void
}) {
  const open = createMemo(() => !!props.schedule)

  return (
    <Dialog open={open()} onOpenChange={(o) => { if (!o) props.onClose() }}>
      <DialogContent class="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogTitle>Executions: {props.schedule?.name}</DialogTitle>
        <DialogDescription>Recent execution history</DialogDescription>

        <Show when={props.loading}>
          <p class="text-sm text-muted-foreground py-4">Loading...</p>
        </Show>

        <Show when={!props.loading && props.executions.length === 0}>
          <p class="text-sm text-muted-foreground py-4">No executions yet.</p>
        </Show>

        <Show when={!props.loading && props.executions.length > 0}>
          <div class="mt-2 space-y-1.5">
            <For each={props.executions}>
              {(exec) => (
                <div class="flex items-center gap-3 text-xs border rounded px-3 py-2">
                  <Badge
                    variant={exec.statusCode && exec.statusCode < 400 ? "success" : "destructive"}
                    class="text-[10px] px-1.5"
                  >
                    {exec.statusCode ?? "ERR"}
                  </Badge>
                  <span class="text-muted-foreground">{exec.trigger}</span>
                  <span class="flex-1 text-muted-foreground">
                    {new Date(exec.firedAt).toLocaleString()}
                  </span>
                  <Show when={exec.latencyMs != null}>
                    <span class="text-muted-foreground">{exec.latencyMs}ms</span>
                  </Show>
                  <Show when={exec.error}>
                    <span class="text-destructive truncate max-w-48" title={exec.error ?? ""}>
                      {exec.error}
                    </span>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  )
}

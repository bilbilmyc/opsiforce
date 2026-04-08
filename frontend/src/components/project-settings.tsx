import { For, Show, createSignal, createEffect, createMemo } from "solid-js"
import { toast } from "solid-sonner"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { api, type Project } from "~/api/client"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { CircleDollarSign, Clock } from "~/components/icons"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/select"
import { Button } from "~/components/ui/button"
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  NumberFieldIncrementTrigger,
  NumberFieldDecrementTrigger,
} from "~/components/ui/number-field"

interface BudgetEntry {
  keyType: "chat" | "backend"
  maxBudget: number | null
  budgetDuration: string | null
}

interface KeyTypeUsage {
  keyType: "chat" | "backend"
  totalRequests: number
  totalTokens: number
  totalCost: number
}

interface ProjectUsage {
  projectId: string
  totalCost: number
  byKeyType?: KeyTypeUsage[]
}

const DURATION_OPTIONS = [
  { value: "1d", label: "Daily" },
  { value: "1w", label: "Weekly" },
  { value: "1M", label: "Monthly" },
  { value: "1Y", label: "Yearly" },
]

const KEY_TYPE_LABELS: Record<string, string> = {
  chat: "Agent (Chat)",
  backend: "App Backend",
}

const TIME_UNITS = [
  { value: "minutes", label: "Minutes", multiplier: 60 * 1000 },
  { value: "hours", label: "Hours", multiplier: 60 * 60 * 1000 },
  { value: "days", label: "Days", multiplier: 24 * 60 * 60 * 1000 },
]

function durationToUnitValue(duration: number): { value: string; unit: string } {
  const day = 24 * 60 * 60 * 1000
  const hour = 60 * 60 * 1000
  const minute = 60 * 1000

  if (duration >= day && duration % day === 0) return { value: String(duration / day), unit: "days" }
  if (duration >= hour && duration % hour === 0) return { value: String(duration / hour), unit: "hours" }
  return { value: String(duration / minute), unit: "minutes" }
}

function unitValueToDuration(value: string, unit: string, fallback: number): number {
  const num = parseFloat(value)
  if (!num || num <= 0) return fallback
  const u = TIME_UNITS.find((t) => t.value === unit)
  return Math.round(num * (u?.multiplier ?? 1))
}

interface BudgetDraft { budget: string; duration: string }

export default function ProjectSettings(props: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canBudgets = () => hasPermission(Permission.manageProjectBudgetSettings)
  const canTimeouts = () => hasPermission(Permission.manageProjectTimeoutSettings)
  const defaultTab = createMemo(() => canBudgets() ? "budgets" : "timeouts")
  const [activeTab, setActiveTab] = createSignal(defaultTab())
  const [budgetDrafts, setBudgetDrafts] = createSignal<Record<string, BudgetDraft>>({})
  const [agentValue, setAgentValue] = createSignal("")
  const [agentUnit, setAgentUnit] = createSignal("minutes")
  const [appValue, setAppValue] = createSignal("")
  const [appUnit, setAppUnit] = createSignal("days")
  const [budgetsDirty, setBudgetsDirty] = createSignal(false)
  const [timeoutsDirty, setTimeoutsDirty] = createSignal(false)
  const [saving, setSaving] = createSignal(false)

  const project = createQuery(() => ({
    queryKey: ["projects", props.projectId],
    queryFn: () => api.get<Project>(`/projects/${props.projectId}`),
    enabled: props.open,
  }))

  const budgets = createQuery(() => ({
    queryKey: ["projects", props.projectId, "budgets"],
    queryFn: () => api.get<BudgetEntry[]>(`/usage/projects/${props.projectId}/budgets`),
    enabled: props.open,
  }))

  const usage = createQuery(() => ({
    queryKey: ["projects", props.projectId, "usage"],
    queryFn: () => api.get<ProjectUsage>(`/usage/projects/${props.projectId}`),
    enabled: props.open,
  }))

  createEffect(() => {
    if (budgets.data) {
      const drafts: Record<string, BudgetDraft> = {}
      for (const entry of budgets.data) {
        drafts[entry.keyType] = {
          budget: entry.maxBudget != null ? String(entry.maxBudget) : "",
          duration: entry.budgetDuration ?? "1M",
        }
      }
      setBudgetDrafts(drafts)
      setBudgetsDirty(false)
    }
  })

  createEffect(() => {
    if (project.data) {
      const agent = durationToUnitValue(project.data.timeoutIdle)
      setAgentValue(agent.value)
      setAgentUnit(agent.unit)
      const app = durationToUnitValue(project.data.appTimeoutIdle)
      setAppValue(app.value)
      setAppUnit(app.unit)
      setTimeoutsDirty(false)
    }
  })

  function updateBudgetDraft(keyType: string, field: keyof BudgetDraft, value: string) {
    setBudgetDrafts((prev) => ({ ...prev, [keyType]: { ...prev[keyType], [field]: value } }))
    setBudgetsDirty(true)
  }

  const isDirty = () => activeTab() === "budgets" ? budgetsDirty() : timeoutsDirty()

  async function handleSave() {
    setSaving(true)
    try {
      if (activeTab() === "budgets") {
        const entries = Object.entries(budgetDrafts())
        for (const [keyType, draft] of entries) {
          await api.put(`/usage/projects/${props.projectId}/budgets`, {
            keyType,
            maxBudget: parseFloat(draft.budget) || 0,
            budgetDuration: draft.duration,
          })
        }
        await qc.invalidateQueries({ queryKey: ["projects", props.projectId, "budgets"] })
        toast.success("Budgets updated")
      } else {
        const projectData = project.data
        if (!projectData) throw new Error("Project not loaded")

        await api.patch(`/projects/${props.projectId}`, {
          timeoutIdle: unitValueToDuration(
            agentValue(),
            agentUnit(),
            projectData.timeoutIdle,
          ),
          appTimeoutIdle: unitValueToDuration(
            appValue(),
            appUnit(),
            projectData.appTimeoutIdle,
          ),
        })
        await qc.invalidateQueries({ queryKey: ["projects", props.projectId] })
        toast.success("Timeouts updated")
      }
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    props.onOpenChange(false)
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogTitle>Project Settings</DialogTitle>
        <DialogDescription>Configure budgets and timeouts for this project.</DialogDescription>

        <Tabs defaultValue={defaultTab()} class="mt-4" onChange={setActiveTab}>
          <TabsList>
            <Show when={canBudgets()}>
              <TabsTrigger value="budgets">
                <CircleDollarSign class="w-3.5 h-3.5 mr-1.5" />
                Budgets
              </TabsTrigger>
            </Show>
            <Show when={canTimeouts()}>
              <TabsTrigger value="timeouts">
                <Clock class="w-3.5 h-3.5 mr-1.5" />
                Timeouts
              </TabsTrigger>
            </Show>
          </TabsList>

          <Show when={canBudgets()}>
            <TabsContent value="budgets">
              <div class="space-y-3">
                <Show
                  when={budgets.data && budgets.data.length > 0}
                  fallback={
                    <p class="text-xs text-muted-foreground py-4 text-center">
                      {budgets.isLoading ? "Loading..." : "No API keys configured."}
                    </p>
                  }
                >
                  <For each={budgets.data}>
                    {(entry) => {
                      const spend = () => usage.data?.byKeyType?.find((u) => u.keyType === entry.keyType)?.totalCost ?? 0
                      return (
                        <BudgetRow
                          label={KEY_TYPE_LABELS[entry.keyType] ?? entry.keyType}
                          currentBudget={entry.maxBudget}
                          currentDuration={entry.budgetDuration}
                          currentSpend={spend()}
                          draftBudget={budgetDrafts()[entry.keyType]?.budget ?? ""}
                          draftDuration={budgetDrafts()[entry.keyType]?.duration ?? "1M"}
                          onBudgetChange={(v) => updateBudgetDraft(entry.keyType, "budget", v)}
                          onDurationChange={(v) => updateBudgetDraft(entry.keyType, "duration", v)}
                        />
                      )
                    }}
                  </For>
                </Show>
              </div>
            </TabsContent>
          </Show>

          <Show when={canTimeouts()}>
            <TabsContent value="timeouts">
              <div class="space-y-3">
                <TimeoutRow
                  label="Agent Idle Timeout"
                  description="How long the coding agent can be idle before pod suspends."
                  placeholder="30"
                  value={agentValue()}
                  unit={agentUnit()}
                  onValueChange={(v) => { setAgentValue(v); setTimeoutsDirty(true) }}
                  onUnitChange={(v) => { setAgentUnit(v); setTimeoutsDirty(true) }}
                />
                <TimeoutRow
                  label="App Idle Timeout"
                  description="How long the webapp preview stays alive without visitors."
                  placeholder="7"
                  value={appValue()}
                  unit={appUnit()}
                  onValueChange={(v) => { setAppValue(v); setTimeoutsDirty(true) }}
                  onUnitChange={(v) => { setAppUnit(v); setTimeoutsDirty(true) }}
                />
              </div>
            </TabsContent>
          </Show>
        </Tabs>

        <div class="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!isDirty() || saving()}
            onClick={handleSave}
          >
            {saving() ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BudgetRow(props: {
  label: string
  currentBudget: number | null
  currentDuration: string | null
  currentSpend: number
  draftBudget: string
  draftDuration: string
  onBudgetChange: (value: string) => void
  onDurationChange: (value: string) => void
}) {
  const durationOption = () => DURATION_OPTIONS.find((d) => d.value === props.draftDuration) ?? null
  const hasBudget = () => props.currentBudget != null && props.currentBudget > 0
  const pct = () => hasBudget() ? Math.min((props.currentSpend / props.currentBudget!) * 100, 100) : 0

  return (
    <div class="rounded-lg border border-border p-3 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-foreground">{props.label}</span>
        <Show when={hasBudget()}>
          <span class="text-xs tabular-nums text-muted-foreground">
            ${props.currentSpend.toFixed(2)} / ${props.currentBudget}
          </span>
        </Show>
      </div>

      <Show when={hasBudget()}>
        <div class="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            class="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct()}%` }}
          />
        </div>
      </Show>

      <div class="flex items-end gap-2">
        <NumberField
          class="flex-1"
          minValue={0}
          step={1}
          value={props.draftBudget}
          onChange={(v) => props.onBudgetChange(v)}
        >
          <label class="text-xs text-muted-foreground mb-1 block">Max budget (USD)</label>
          <NumberFieldGroup>
            <NumberFieldInput placeholder="0 = unlimited" />
            <NumberFieldIncrementTrigger />
            <NumberFieldDecrementTrigger />
          </NumberFieldGroup>
        </NumberField>
        <div class="w-28">
          <label class="text-xs text-muted-foreground mb-1 block">Period</label>
          <Select
            options={DURATION_OPTIONS}
            optionValue="value"
            optionTextValue="label"
            value={durationOption()}
            onChange={(opt) => { if (opt) props.onDurationChange(opt.value) }}
            itemComponent={(itemProps) => (
              <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
            )}
          >
            <SelectTrigger>
              <SelectValue<typeof DURATION_OPTIONS[0]>>
                {(state) => <span>{state.selectedOption()?.label ?? "Select"}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>
      </div>
    </div>
  )
}

function TimeoutRow(props: {
  label: string
  description: string
  placeholder: string
  value: string
  unit: string
  onValueChange: (value: string) => void
  onUnitChange: (unit: string) => void
}) {
  const unitOption = () => TIME_UNITS.find((u) => u.value === props.unit) ?? null

  return (
    <div class="rounded-lg border border-border p-3 space-y-2.5">
      <span class="text-xs font-medium text-foreground block">{props.label}</span>
      <p class="text-xs text-muted-foreground/70">{props.description}</p>
      <div class="flex items-end gap-2">
        <NumberField
          class="flex-1"
          minValue={1}
          step={1}
          value={props.value}
          onChange={(v) => props.onValueChange(v)}
        >
          <NumberFieldGroup>
            <NumberFieldInput placeholder={props.placeholder} />
            <NumberFieldIncrementTrigger />
            <NumberFieldDecrementTrigger />
          </NumberFieldGroup>
        </NumberField>
        <div class="w-28">
          <Select
            options={TIME_UNITS}
            optionValue="value"
            optionTextValue="label"
            value={unitOption()}
            onChange={(opt) => { if (opt) props.onUnitChange(opt.value) }}
            itemComponent={(itemProps) => (
              <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
            )}
          >
            <SelectTrigger>
              <SelectValue<typeof TIME_UNITS[0]>>
                {(state) => <span>{state.selectedOption()?.label ?? "Minutes"}</span>}
              </SelectValue>
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div>
      </div>
    </div>
  )
}

import { For, Show, createSignal, createEffect, createMemo } from "solid-js"
import { toast } from "solid-sonner"
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { api, type Project } from "~/api/client"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { CircleDollarSign, Clock } from "~/components/icons"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { Button } from "~/components/ui/button"
import { BudgetRow } from "~/components/ui/budget-row"
import { TimeoutRow } from "~/components/ui/timeout-row"
import Skeleton from "~/components/ui/skeleton"
import { msToUnit, unitToMs } from "~/lib/duration-units"
import { type BudgetConfig } from "~/constants/budget"

interface BudgetEntry {
  keyType: "chat" | "backend"
  maxBudget: number | null
  budgetDuration: string | null
  currentUsage: number
}

const KEY_TYPE_LABELS: Record<string, string> = {
  chat: "Agent (Chat)",
  backend: "App Backend",
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
  const defaultTab = createMemo(() => (canBudgets() ? "budgets" : "timeouts"))
  const [activeTab, setActiveTab] = createSignal(defaultTab())
  const [budgetDrafts, setBudgetDrafts] = createSignal<Record<string, BudgetDraft>>({})
  const [projectBudgetDraft, setProjectBudgetDraft] = createSignal("")
  const [projectDurationDraft, setProjectDurationDraft] = createSignal("1M")
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

  const projectBudget = createQuery(() => ({
    queryKey: ["projects", props.projectId, "budget"],
    queryFn: () => api.get<BudgetConfig>(`/usage/projects/${props.projectId}/budget`),
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
    if (projectBudget.data) {
      setProjectBudgetDraft(projectBudget.data.maxBudget != null ? String(projectBudget.data.maxBudget) : "")
      setProjectDurationDraft(projectBudget.data.budgetDuration ?? "1M")
    }
  })

  createEffect(() => {
    if (project.data) {
      const agent = msToUnit(project.data.timeoutIdle)
      setAgentValue(agent.value)
      setAgentUnit(agent.unit)
      const app = msToUnit(project.data.appTimeoutIdle)
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
        const updates: Promise<unknown>[] = []
        const projectBudgetValue = parseFloat(projectBudgetDraft())
        if (!isNaN(projectBudgetValue)) {
          updates.push(api.put(`/usage/projects/${props.projectId}/budget`, { maxBudget: projectBudgetValue, budgetDuration: projectDurationDraft() }))
        }
        for (const [keyType, draft] of Object.entries(budgetDrafts())) {
          updates.push(api.put(`/usage/projects/${props.projectId}/budgets`, {
            keyType,
            maxBudget: parseFloat(draft.budget) || 0,
            budgetDuration: draft.duration,
          }))
        }
        await Promise.all(updates)
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["projects", props.projectId, "budgets"] }),
          qc.invalidateQueries({ queryKey: ["projects", props.projectId, "budget"] }),
        ])
        toast.success("Budgets updated")
      } else {
        const projectData = project.data
        if (!projectData) throw new Error("Project not loaded")

        await api.patch(`/projects/${props.projectId}`, {
          timeoutIdle: unitToMs(
            agentValue(),
            agentUnit(),
            projectData.timeoutIdle,
          ),
          appTimeoutIdle: unitToMs(
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
      <DialogContent class="max-w-2xl">
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
                <BudgetRow
                  label="Project Budget"
                  currentBudget={projectBudget.data?.maxBudget ?? null}
                  currentSpend={projectBudget.data?.currentUsage ?? 0}
                  draftBudget={projectBudgetDraft()}
                  draftDuration={projectDurationDraft()}
                  onBudgetChange={(v) => { setProjectBudgetDraft(v); setBudgetsDirty(true) }}
                  onDurationChange={(v) => { setProjectDurationDraft(v); setBudgetsDirty(true) }}
                />
                <Show
                  when={budgets.data && budgets.data.length > 0}
                  fallback={
                    <Show
                      when={budgets.isLoading}
                      fallback={
                        <p class="text-xs text-muted-foreground py-4 text-center">
                          No API keys configured.
                        </p>
                      }
                    >
                      <div class="space-y-2 py-2">
                        <Skeleton class="h-8 w-full" />
                        <Skeleton class="h-8 w-full" />
                      </div>
                    </Show>
                  }
                >
                  <For each={budgets.data}>
                    {(entry) => (
                        <BudgetRow
                          label={KEY_TYPE_LABELS[entry.keyType] ?? entry.keyType}
                          currentBudget={entry.maxBudget}
                          currentSpend={entry.currentUsage}
                          draftBudget={budgetDrafts()[entry.keyType]?.budget ?? ""}
                          draftDuration={budgetDrafts()[entry.keyType]?.duration ?? "1M"}
                          onBudgetChange={(v) => updateBudgetDraft(entry.keyType, "budget", v)}
                          onDurationChange={(v) => updateBudgetDraft(entry.keyType, "duration", v)}
                        />
                    )}
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



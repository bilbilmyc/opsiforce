import { Show, createMemo, createSignal, type JSX } from "solid-js"
import { createQuery, useQueryClient } from "@tanstack/solid-query"
import { toast } from "solid-sonner"
import {
  api,
  type TimeoutDefaults,
  type BudgetDefaults,
  type AgentDefaults,
} from "~/api/client"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { Clock, CircleDollarSign, Cpu, SlidersHorizontal } from "~/components/icons"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { Button } from "~/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectSection } from "~/components/ui/select"
import { TimeoutRow } from "~/components/ui/timeout-row"
import { BudgetRow } from "~/components/ui/budget-row"
import { msToUnit, unitToMs } from "~/lib/duration-units"

type Scope = "global" | "tenant"

export default function DefaultsPage() {
  const { hasPermission } = usePermissions()
  const canPlatform = () => hasPermission(Permission.managePlatformDefaults)
  const canTenant = () => hasPermission(Permission.manageTenantDefaults)
  const defaultScope = createMemo<Scope>(() => (canPlatform() ? "global" : "tenant"))
  const [scope, setScope] = createSignal<Scope>(defaultScope())

  return (
    <div class="h-full overflow-y-auto">
      <div class="max-w-2xl mx-auto p-6 space-y-6">
        <div class="flex items-center gap-2">
          <SlidersHorizontal class="w-5 h-5 text-muted-foreground" />
          <h1 class="text-lg font-semibold">Defaults</h1>
        </div>
        <p class="text-xs text-muted-foreground">
          Defaults seed new tenants (platform scope) and new projects/keys (tenant scope). Changing
          these does not affect existing entities.
        </p>

        <Tabs value={scope()} onChange={(v) => setScope(v as Scope)}>
          <TabsList>
            <Show when={canPlatform()}>
              <TabsTrigger value="global">Global</TabsTrigger>
            </Show>
            <Show when={canTenant()}>
              <TabsTrigger value="tenant">Tenant</TabsTrigger>
            </Show>
          </TabsList>
          <Show when={canPlatform()}>
            <TabsContent value="global">
              <DefaultsForm scope="global" />
            </TabsContent>
          </Show>
          <Show when={canTenant()}>
            <TabsContent value="tenant">
              <DefaultsForm scope="tenant" />
            </TabsContent>
          </Show>
        </Tabs>
      </div>
    </div>
  )
}

function DefaultsForm(props: { scope: Scope }) {
  const qc = useQueryClient()
  const base = () => `/defaults/${props.scope}`
  const keyPrefix = () => ["defaults", props.scope] as const

  const timeouts = createQuery(() => ({
    queryKey: [...keyPrefix(), "timeouts"],
    queryFn: () => api.get<TimeoutDefaults>(`${base()}/timeouts`),
  }))
  const budgets = createQuery(() => ({
    queryKey: [...keyPrefix(), "budgets"],
    queryFn: () => api.get<BudgetDefaults>(`${base()}/budgets`),
  }))
  const agent = createQuery(() => ({
    queryKey: [...keyPrefix(), "agent"],
    queryFn: () => api.get<AgentDefaults>(`${base()}/agent`),
  }))

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: [...keyPrefix(), "timeouts"] }),
      qc.invalidateQueries({ queryKey: [...keyPrefix(), "budgets"] }),
      qc.invalidateQueries({ queryKey: [...keyPrefix(), "agent"] }),
    ])
  }

  return (
    <div class="space-y-4 mt-4">
      <Show when={timeouts.data}>
        {(data) => (
          <TimeoutsSection
            base={base()}
            data={data()}
            onSaved={invalidate}
          />
        )}
      </Show>
      <Show when={budgets.data}>
        {(data) => (
          <BudgetsSection
            base={base()}
            data={data()}
            onSaved={invalidate}
          />
        )}
      </Show>
      <Show when={agent.data}>
        {(data) => (
          <AgentSection
            base={base()}
            data={data()}
            onSaved={invalidate}
          />
        )}
      </Show>
    </div>
  )
}

function TimeoutsSection(props: {
  base: string
  data: TimeoutDefaults
  onSaved: () => Promise<void>
}) {
  const agentInit = msToUnit(props.data.defaultTimeoutIdle)
  const appInit = msToUnit(props.data.defaultAppTimeoutIdle)
  const [agentValue, setAgentValue] = createSignal(agentInit.value)
  const [agentUnit, setAgentUnit] = createSignal(agentInit.unit)
  const [appValue, setAppValue] = createSignal(appInit.value)
  const [appUnit, setAppUnit] = createSignal(appInit.unit)
  const [dirty, setDirty] = createSignal(false)
  const [saving, setSaving] = createSignal(false)

  async function save() {
    setSaving(true)
    try {
      await api.patch(`${props.base}/timeouts`, {
        defaultTimeoutIdle: unitToMs(agentValue(), agentUnit(), props.data.defaultTimeoutIdle),
        defaultAppTimeoutIdle: unitToMs(appValue(), appUnit(), props.data.defaultAppTimeoutIdle),
      })
      await props.onSaved()
      setDirty(false)
      toast.success("Timeouts updated")
    } catch {
      toast.error("Failed to save timeouts")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard icon={<Clock class="w-4 h-4 text-muted-foreground" />} title="Timeouts" saving={saving()} dirty={dirty()} onSave={save}>
      <TimeoutRow
        label="Agent Idle Timeout"
        placeholder="30"
        value={agentValue()}
        unit={agentUnit()}
        onValueChange={(v) => { setAgentValue(v); setDirty(true) }}
        onUnitChange={(v) => { setAgentUnit(v); setDirty(true) }}
      />
      <TimeoutRow
        label="App Idle Timeout"
        placeholder="7"
        value={appValue()}
        unit={appUnit()}
        onValueChange={(v) => { setAppValue(v); setDirty(true) }}
        onUnitChange={(v) => { setAppUnit(v); setDirty(true) }}
      />
    </SectionCard>
  )
}

function BudgetsSection(props: {
  base: string
  data: BudgetDefaults
  onSaved: () => Promise<void>
}) {
  const [tenantBudget, setTenantBudget] = createSignal(String(props.data.defaultTenantBudget))
  const [tenantDuration, setTenantDuration] = createSignal(props.data.defaultTenantBudgetDuration)
  const [projectBudget, setProjectBudget] = createSignal(String(props.data.defaultProjectBudget))
  const [projectDuration, setProjectDuration] = createSignal(props.data.defaultProjectBudgetDuration)
  const [chatBudget, setChatBudget] = createSignal(String(props.data.defaultChatBudget))
  const [chatDuration, setChatDuration] = createSignal(props.data.defaultChatBudgetDuration)
  const [backendBudget, setBackendBudget] = createSignal(String(props.data.defaultBackendBudget))
  const [backendDuration, setBackendDuration] = createSignal(props.data.defaultBackendBudgetDuration)
  const [dirty, setDirty] = createSignal(false)
  const [saving, setSaving] = createSignal(false)

  async function save() {
    setSaving(true)
    try {
      await api.patch(`${props.base}/budgets`, {
        defaultTenantBudget: parseFloat(tenantBudget()) || 0,
        defaultTenantBudgetDuration: tenantDuration(),
        defaultProjectBudget: parseFloat(projectBudget()) || 0,
        defaultProjectBudgetDuration: projectDuration(),
        defaultChatBudget: parseFloat(chatBudget()) || 0,
        defaultChatBudgetDuration: chatDuration(),
        defaultBackendBudget: parseFloat(backendBudget()) || 0,
        defaultBackendBudgetDuration: backendDuration(),
      })
      await props.onSaved()
      setDirty(false)
      toast.success("Budgets updated")
    } catch {
      toast.error("Failed to save budgets")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard icon={<CircleDollarSign class="w-4 h-4 text-muted-foreground" />} title="Budgets" saving={saving()} dirty={dirty()} onSave={save}>
      <BudgetRow label="Tenant" draftBudget={tenantBudget()} draftDuration={tenantDuration()} onBudgetChange={(v) => { setTenantBudget(v); setDirty(true) }} onDurationChange={(v) => { setTenantDuration(v); setDirty(true) }} />
      <BudgetRow label="Project" draftBudget={projectBudget()} draftDuration={projectDuration()} onBudgetChange={(v) => { setProjectBudget(v); setDirty(true) }} onDurationChange={(v) => { setProjectDuration(v); setDirty(true) }} />
      <BudgetRow label="Agent (Chat) Key" draftBudget={chatBudget()} draftDuration={chatDuration()} onBudgetChange={(v) => { setChatBudget(v); setDirty(true) }} onDurationChange={(v) => { setChatDuration(v); setDirty(true) }} />
      <BudgetRow label="App Backend Key" draftBudget={backendBudget()} draftDuration={backendDuration()} onBudgetChange={(v) => { setBackendBudget(v); setDirty(true) }} onDurationChange={(v) => { setBackendDuration(v); setDirty(true) }} />
    </SectionCard>
  )
}

interface ModelGroup {
  label: string
  options: AgentDefaults["availableModels"]
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
}

function groupModelsByProvider(models: AgentDefaults["availableModels"]): ModelGroup[] {
  const buckets = new Map<string, AgentDefaults["availableModels"]>()
  for (const m of models) {
    const provider = m.value.split("/")[0] ?? "other"
    const existing = buckets.get(provider)
    if (existing) {
      existing.push(m)
    } else {
      buckets.set(provider, [m])
    }
  }
  return Array.from(buckets.entries()).map(([provider, options]) => ({
    label: PROVIDER_LABELS[provider] ?? provider,
    options,
  }))
}

function AgentSection(props: {
  base: string
  data: AgentDefaults
  onSaved: () => Promise<void>
}) {
  const [model, setModel] = createSignal(props.data.defaultModel)
  const [dirty, setDirty] = createSignal(false)
  const [saving, setSaving] = createSignal(false)

  async function save() {
    setSaving(true)
    try {
      await api.patch(`${props.base}/agent`, { defaultModel: model() })
      await props.onSaved()
      setDirty(false)
      toast.success("Agent defaults updated")
    } catch {
      toast.error("Failed to save agent defaults")
    } finally {
      setSaving(false)
    }
  }

  const groups = createMemo(() => groupModelsByProvider(props.data.availableModels))
  const selectedOption = () => props.data.availableModels.find((m) => m.value === model()) ?? null

  return (
    <SectionCard icon={<Cpu class="w-4 h-4 text-muted-foreground" />} title="Agent" saving={saving()} dirty={dirty()} onSave={save}>
      <div class="rounded-lg border border-border p-3 space-y-2.5">
        <label class="text-xs font-medium text-foreground block">Default Model</label>
        <Select<AgentDefaults["availableModels"][0], ModelGroup>
          options={groups()}
          optionValue="value"
          optionTextValue="label"
          optionGroupChildren="options"
          value={selectedOption()}
          onChange={(opt) => { if (opt) { setModel(opt.value); setDirty(true) } }}
          itemComponent={(itemProps) => (
            <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>
          )}
          sectionComponent={(sectionProps) => (
            <SelectSection>{sectionProps.section.rawValue.label}</SelectSection>
          )}
        >
          <SelectTrigger>
            <SelectValue<typeof props.data.availableModels[0]>>
              {(state) => <span>{state.selectedOption()?.label ?? model()}</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent />
        </Select>
        <p class="text-xs text-muted-foreground/70">
          Used to seed new projects. Existing projects keep their current model.
        </p>
      </div>
    </SectionCard>
  )
}

function SectionCard(props: {
  icon: JSX.Element
  title: string
  dirty: boolean
  saving: boolean
  onSave: () => void
  children: JSX.Element
}) {
  return (
    <div class="rounded-lg border border-border p-4 space-y-3">
      <div class="flex items-center gap-2">
        {props.icon}
        <span class="text-sm font-medium">{props.title}</span>
      </div>
      <div class="space-y-3">{props.children}</div>
      <div class="flex justify-end pt-1">
        <Button size="sm" disabled={!props.dirty || props.saving} onClick={props.onSave}>
          {props.saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}


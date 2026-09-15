import { t } from '~/i18n';
import { Show, createMemo, createSignal, type JSX } from 'solid-js';
import { useQueryClient } from '@tanstack/solid-query';
import { createAppQuery } from '~/lib/create-app-query';
import { toast } from 'solid-sonner';
import { api, type TimeoutDefaults, type BudgetDefaults } from '~/api/client';
import { usePermissions } from '~/api/permissions';
import { Permission } from '~/constants/permissions';
import { Clock, CircleDollarSign, SlidersHorizontal } from '~/components/icons';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '~/components/ui/tabs';
import { Button } from '~/components/ui/button';
import { PlatformModelSettings } from '~/components/settings/platform-model-settings';
import { SettingsSection } from '~/components/settings/settings-section';
import { TimeoutRow } from '~/components/ui/timeout-row';
import { BudgetRow } from '~/components/ui/budget-row';
import { MIN_IDLE_TIMEOUT_LABEL, MIN_IDLE_TIMEOUT_MS, msToUnit, unitToMs } from '~/lib/duration-units';

type Scope = 'global' | 'tenant';

export function DefaultsPage() {
  const { hasPermission } = usePermissions();
  const canPlatform = () => hasPermission(Permission.managePlatformDefaults);
  const canTenant = () => hasPermission(Permission.manageTenantDefaults);
  const defaultScope = createMemo<Scope>(() => (canPlatform() ? 'global' : 'tenant'));
  const [scope, setScope] = createSignal<Scope>(defaultScope());

  const scopeDescription = () =>
    scope() === 'global'
      ? t("These seed every new organization created on the platform. Existing organizations keep their own values.")
      : t("These seed every new project (and its LLM keys) in this organization. Existing projects keep their own values.");

  return (
    <SettingsSection
      icon={SlidersHorizontal}
      title={t("Defaults")}
      description={t("Manage the platform model default and the starting timeouts and budgets for organizations and projects.")}
    >
      <Show when={canPlatform()}>
        <PlatformModelSettings />
      </Show>
      <Tabs value={scope()} onChange={(v) => setScope(v as Scope)}>
        <TabsList>
          <Show when={canPlatform()}>
            <TabsTrigger value="global">{t("New organizations")}</TabsTrigger>
          </Show>
          <Show when={canTenant()}>
            <TabsTrigger value="tenant">{t("New projects")}</TabsTrigger>
          </Show>
        </TabsList>
        <p class="mt-3 text-xs text-muted-foreground">{scopeDescription()}</p>
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
    </SettingsSection>
  );
}

function DefaultsForm(props: { scope: Scope }) {
  const qc = useQueryClient();
  const base = () => `/defaults/${props.scope}`;
  const keyPrefix = () => ['defaults', props.scope] as const;

  const timeouts = createAppQuery(() => ({
    queryKey: [...keyPrefix(), 'timeouts'],
    queryFn: () => api.get<TimeoutDefaults>(`${base()}/timeouts`),
  }));
  const budgets = createAppQuery(() => ({
    queryKey: [...keyPrefix(), 'budgets'],
    queryFn: () => api.get<BudgetDefaults>(`${base()}/budgets`),
  }));

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: [...keyPrefix(), 'timeouts'] }),
      qc.invalidateQueries({ queryKey: [...keyPrefix(), 'budgets'] }),
    ]);
  }

  return (
    <div class="space-y-4 mt-4">
      <Show when={timeouts.data}>{(data) => <TimeoutsSection base={base()} data={data()} onSaved={invalidate} />}</Show>
      <Show when={budgets.data}>{(data) => <BudgetsSection base={base()} data={data()} onSaved={invalidate} />}</Show>
    </div>
  );
}

function TimeoutsSection(props: { base: string; data: TimeoutDefaults; onSaved: () => Promise<void> }) {
  const agentInit = msToUnit(props.data.defaultTimeoutIdle);
  const appInit = msToUnit(props.data.defaultAppTimeoutIdle);
  const [agentValue, setAgentValue] = createSignal(agentInit.value);
  const [agentUnit, setAgentUnit] = createSignal(agentInit.unit);
  const [appValue, setAppValue] = createSignal(appInit.value);
  const [appUnit, setAppUnit] = createSignal(appInit.unit);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  async function save() {
    const defaultTimeoutIdle = unitToMs(agentValue(), agentUnit(), props.data.defaultTimeoutIdle);
    const defaultAppTimeoutIdle = unitToMs(appValue(), appUnit(), props.data.defaultAppTimeoutIdle);
    if (defaultTimeoutIdle < MIN_IDLE_TIMEOUT_MS || defaultAppTimeoutIdle < MIN_IDLE_TIMEOUT_MS) {
      toast.error(t("Idle timeouts must be at least {0}", { "0": t(MIN_IDLE_TIMEOUT_LABEL) }));
      return;
    }

    setSaving(true);
    try {
      await api.patch(`${props.base}/timeouts`, { defaultTimeoutIdle, defaultAppTimeoutIdle });
      await props.onSaved();
      setDirty(false);
      toast.success(t("Timeouts updated"));
    } catch {
      toast.error(t("Failed to save timeouts"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<Clock class="w-4 h-4 text-muted-foreground" />}
      title={t("Timeouts")}
      saving={saving()}
      dirty={dirty()}
      onSave={save}
    >
      <TimeoutRow
        label={t("Agent Idle Timeout")}
        description={t("Minimum {0}.", { "0": t(MIN_IDLE_TIMEOUT_LABEL) })}
        placeholder="30"
        value={agentValue()}
        unit={agentUnit()}
        onValueChange={(v) => {
          setAgentValue(v);
          setDirty(true);
        }}
        onUnitChange={(v) => {
          setAgentUnit(v);
          setDirty(true);
        }}
      />
      <TimeoutRow
        label={t("App Idle Timeout")}
        description={t("Minimum {0}.", { "0": t(MIN_IDLE_TIMEOUT_LABEL) })}
        placeholder="7"
        value={appValue()}
        unit={appUnit()}
        onValueChange={(v) => {
          setAppValue(v);
          setDirty(true);
        }}
        onUnitChange={(v) => {
          setAppUnit(v);
          setDirty(true);
        }}
      />
    </SectionCard>
  );
}

function BudgetsSection(props: { base: string; data: BudgetDefaults; onSaved: () => Promise<void> }) {
  const [tenantBudget, setTenantBudget] = createSignal(String(props.data.defaultTenantBudget));
  const [tenantDuration, setTenantDuration] = createSignal(props.data.defaultTenantBudgetDuration);
  const [projectBudget, setProjectBudget] = createSignal(String(props.data.defaultProjectBudget));
  const [projectDuration, setProjectDuration] = createSignal(props.data.defaultProjectBudgetDuration);
  const [chatBudget, setChatBudget] = createSignal(String(props.data.defaultChatBudget));
  const [chatDuration, setChatDuration] = createSignal(props.data.defaultChatBudgetDuration);
  const [backendBudget, setBackendBudget] = createSignal(String(props.data.defaultBackendBudget));
  const [backendDuration, setBackendDuration] = createSignal(props.data.defaultBackendBudgetDuration);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  async function save() {
    setSaving(true);
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
      });
      await props.onSaved();
      setDirty(false);
      toast.success(t("Budgets updated"));
    } catch {
      toast.error(t("Failed to save budgets"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      icon={<CircleDollarSign class="w-4 h-4 text-muted-foreground" />}
      title={t("Budgets")}
      saving={saving()}
      dirty={dirty()}
      onSave={save}
    >
      <BudgetRow
        label={t("Organization")}
        draftBudget={tenantBudget()}
        draftDuration={tenantDuration()}
        onBudgetChange={(v) => {
          setTenantBudget(v);
          setDirty(true);
        }}
        onDurationChange={(v) => {
          setTenantDuration(v);
          setDirty(true);
        }}
      />
      <BudgetRow
        label={t("Project")}
        draftBudget={projectBudget()}
        draftDuration={projectDuration()}
        onBudgetChange={(v) => {
          setProjectBudget(v);
          setDirty(true);
        }}
        onDurationChange={(v) => {
          setProjectDuration(v);
          setDirty(true);
        }}
      />
      <BudgetRow
        label={t("Agent (Chat) Key")}
        draftBudget={chatBudget()}
        draftDuration={chatDuration()}
        onBudgetChange={(v) => {
          setChatBudget(v);
          setDirty(true);
        }}
        onDurationChange={(v) => {
          setChatDuration(v);
          setDirty(true);
        }}
      />
      <BudgetRow
        label={t("App Backend Key")}
        draftBudget={backendBudget()}
        draftDuration={backendDuration()}
        onBudgetChange={(v) => {
          setBackendBudget(v);
          setDirty(true);
        }}
        onDurationChange={(v) => {
          setBackendDuration(v);
          setDirty(true);
        }}
      />
    </SectionCard>
  );
}

function SectionCard(props: {
  icon: JSX.Element;
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: JSX.Element;
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
          {props.saving ? t("Saving...") : t("Save")}
        </Button>
      </div>
    </div>
  );
}

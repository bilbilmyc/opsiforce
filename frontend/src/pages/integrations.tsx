import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import { toast } from 'solid-sonner';
import { useTenantSettings, useUpdateTenantSettings } from '~/api/tenant-settings';
import { parseMakaraTenants, useUserInfo } from '~/api/user';
import { SettingsSection } from '~/components/settings/settings-section';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import Skeleton from '~/components/ui/skeleton';
import { AlertTriangle, Plug } from '~/components/icons';

export function IntegrationsPage() {
  const settings = useTenantSettings();
  const userInfo = useUserInfo();
  const update = useUpdateTenantSettings();

  const availableMakaraTenants = createMemo(() => parseMakaraTenants(userInfo.data?.groups ?? []));
  const savedMakaraTenantName = () => settings.data?.makaraTenantName ?? null;

  const savedIsInList = createMemo(() => {
    const saved = savedMakaraTenantName();
    if (!saved) return false;
    return availableMakaraTenants().includes(saved);
  });

  const [selected, setSelected] = createSignal<string | null>(null);
  const [dirty, setDirty] = createSignal(false);

  createEffect(() => {
    const saved = savedMakaraTenantName();
    setSelected(saved && availableMakaraTenants().includes(saved) ? saved : null);
    setDirty(false);
  });

  const canSave = () => dirty() && !!selected() && availableMakaraTenants().includes(selected() ?? '');

  const handleSave = async () => {
    const value = selected();
    if (!value) return;
    try {
      await update.mutateAsync({ makaraTenantName: value });
      setDirty(false);
      toast.success('Makara organization mapping saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  return (
    <SettingsSection icon={Plug} title="Integrations" description="Connect this organization to external systems.">
      <div class="space-y-4 rounded-lg border border-border p-4">
        <div class="space-y-2">
          <label class="block text-xs font-medium text-foreground">Makara organization</label>
          <p class="text-xs text-muted-foreground">
            The Makara organization this one maps to. Used for pinned apps and project Makara auth.
          </p>

          <Show when={savedMakaraTenantName() && !savedIsInList()}>
            <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
              <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <div>
                Currently mapped to <span class="font-medium">{savedMakaraTenantName()}</span> — not in your Makara
                organizations. Pick one below to update the mapping.
              </div>
            </div>
          </Show>

          <Show when={!settings.isPending && !userInfo.isPending} fallback={<Skeleton class="h-8 w-full" />}>
            <Show
              when={availableMakaraTenants().length > 0}
              fallback={
                <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  You are not a member of any Makara organizations.
                </div>
              }
            >
              <Select
                options={availableMakaraTenants()}
                placeholder={<span class="text-muted-foreground">Select a Makara organization</span>}
                value={selected()}
                onChange={(v) => {
                  setSelected(v);
                  setDirty(true);
                }}
                itemComponent={(itemProps) => <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>}
              >
                <SelectTrigger>
                  <SelectValue<string>>{(state) => <span>{state.selectedOption()}</span>}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </Show>
          </Show>
        </div>

        <div class="flex justify-end">
          <Button size="sm" disabled={!canSave()} loading={update.isPending} onClick={handleSave}>
            Save
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

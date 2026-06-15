import { Show, createEffect, createMemo, createSignal } from 'solid-js';
import { toast } from 'solid-sonner';
import { usePermissions } from '~/api/permissions';
import { useTenantSettings, useUpdateTenantSettings } from '~/api/tenant-settings';
import { parseMakaraTenants, useUserInfo } from '~/api/user';
import { Permission } from '~/constants/permissions';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import Skeleton from '~/components/ui/skeleton';
import { AlertTriangle, Layers, Plug } from '~/components/icons';
import TenantEnvironmentsSection from '~/components/tenant-environments/tenant-environments-section';

type TenantSettingsTab = 'integrations' | 'environments';

export default function TenantSettings(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { hasPermission } = usePermissions();
  const canManage = () => hasPermission(Permission.manageMakaraIntegration);
  const canManageEnvironments = () => hasPermission(Permission.manageEnvironments);

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
  const defaultTab = createMemo<TenantSettingsTab>(() => (canManage() ? 'integrations' : 'environments'));
  const [activeTab, setActiveTab] = createSignal<TenantSettingsTab>(defaultTab());

  createEffect(() => {
    setActiveTab(defaultTab());
  });

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
      toast.success('Makara tenant mapping saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogTitle>Tenant Settings</DialogTitle>
        <DialogDescription>Integrations and per-tenant configuration.</DialogDescription>

        <Tabs value={activeTab()} onChange={(v) => setActiveTab(v as TenantSettingsTab)} class="mt-4">
          <TabsList>
            <Show when={canManage()}>
              <TabsTrigger value="integrations">
                <Plug class="mr-1.5 h-3.5 w-3.5" />
                Integrations
              </TabsTrigger>
            </Show>
            <Show when={canManageEnvironments()}>
              <TabsTrigger value="environments">
                <Layers class="mr-1.5 h-3.5 w-3.5" />
                Environments
              </TabsTrigger>
            </Show>
          </TabsList>

          <Show when={canManage()}>
            <TabsContent value="integrations">
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="block text-xs font-medium text-foreground">Makara tenant</label>
                  <p class="text-xs text-muted-foreground">
                    The Makara tenant this Opsiforce tenant maps to. Used for pinned apps and project Makara auth.
                  </p>

                  <Show when={savedMakaraTenantName() && !savedIsInList()}>
                    <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                      <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <div>
                        Currently mapped to <span class="font-medium">{savedMakaraTenantName()}</span> — not in your
                        Makara tenants. Pick a tenant below to update the mapping.
                      </div>
                    </div>
                  </Show>

                  <Show when={!settings.isPending && !userInfo.isPending} fallback={<Skeleton class="h-8 w-full" />}>
                    <Show
                      when={availableMakaraTenants().length > 0}
                      fallback={
                        <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                          You are not a member of any Makara tenants.
                        </div>
                      }
                    >
                      <Select
                        options={availableMakaraTenants()}
                        placeholder={<span class="text-muted-foreground">Select a Makara tenant</span>}
                        value={selected()}
                        onChange={(v) => {
                          setSelected(v);
                          setDirty(true);
                        }}
                        itemComponent={(itemProps) => (
                          <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
                        )}
                      >
                        <SelectTrigger>
                          <SelectValue<string>>{(state) => <span>{state.selectedOption()}</span>}</SelectValue>
                        </SelectTrigger>
                        <SelectContent />
                      </Select>
                    </Show>
                  </Show>
                </div>

                <div class="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => props.onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={!canSave()} loading={update.isPending} onClick={handleSave}>
                    Save
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Show>

          <Show when={canManageEnvironments()}>
            <TabsContent value="environments">
              <TenantEnvironmentsSection active={props.open && activeTab() === 'environments'} />
            </TabsContent>
          </Show>
        </Tabs>

        <Show when={!canManage() && !canManageEnvironments()}>
          <div class="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-center">
            <p class="text-sm text-muted-foreground">You do not have permission to manage tenant settings.</p>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}

import { Show, createEffect, createMemo, createSignal } from "solid-js"
import { toast } from "solid-sonner"
import { usePermissions } from "~/api/permissions"
import { useTenantSettings, useUpdateTenantSettings } from "~/api/tenant-settings"
import { parseMakaraTenants, useUserInfo } from "~/api/user"
import { Permission } from "~/constants/permissions"
import { createTenantState } from "~/lib/tenant-state"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog"
import { Button } from "~/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import Skeleton from "~/components/ui/skeleton"
import { AlertTriangle } from "~/components/icons"

export default function TenantSettings(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { hasPermission } = usePermissions()
  const canManage = () => hasPermission(Permission.manageMakaraIntegration)

  const settings = useTenantSettings()
  const userInfo = useUserInfo()
  const update = useUpdateTenantSettings()
  const [currentTenantName] = createTenantState()

  const savedMakaraTenantName = () => settings.data?.makaraTenantName ?? null

  const dropdownOptions = createMemo(() => {
    const groups = parseMakaraTenants(userInfo.data?.groups ?? [])
    const own = currentTenantName()
    if (!own) return groups
    return groups.includes(own) ? groups : [own, ...groups]
  })

  const savedIsInList = createMemo(() => {
    const saved = savedMakaraTenantName()
    if (!saved) return false
    return dropdownOptions().includes(saved)
  })

  const [selected, setSelected] = createSignal<string | null>(null)
  const [dirty, setDirty] = createSignal(false)

  createEffect(() => {
    const saved = savedMakaraTenantName()
    setSelected(saved && dropdownOptions().includes(saved) ? saved : null)
    setDirty(false)
  })

  const canSave = () => dirty() && !!selected() && dropdownOptions().includes(selected() ?? "")

  const handleSave = async () => {
    const value = selected()
    if (!value) return
    try {
      await update.mutateAsync({ makaraTenantName: value })
      setDirty(false)
      toast.success("Makara tenant mapping saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogTitle>Tenant Settings</DialogTitle>
        <DialogDescription>Integrations and per-tenant configuration.</DialogDescription>

        <Show
          when={canManage()}
          fallback={
            <div class="mt-4 p-4 rounded-lg border border-border bg-muted/30 text-center">
              <p class="text-sm text-muted-foreground">
                You do not have permission to manage tenant settings.
              </p>
            </div>
          }
        >
          <div class="mt-4 space-y-4">
            <div class="space-y-2">
              <label class="text-xs font-medium text-foreground block">Makara tenant</label>
              <p class="text-xs text-muted-foreground">
                The Makara tenant this Opsiforce tenant maps to. Used for pinned apps and
                project Makara auth.
              </p>

              <Show when={savedMakaraTenantName() && !savedIsInList()}>
                <div class="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
                  <AlertTriangle class="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <div>
                    Currently mapped to{" "}
                    <span class="font-medium">{savedMakaraTenantName()}</span> — not in your Makara
                    tenants. Pick a tenant below to update the mapping.
                  </div>
                </div>
              </Show>

              <Show
                when={!settings.isPending && !userInfo.isPending}
                fallback={<Skeleton class="h-8 w-full" />}
              >
                <Show
                  when={dropdownOptions().length > 0}
                  fallback={
                    <div class="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      You are not a member of any Makara tenants.
                    </div>
                  }
                >
                  <Select
                    options={dropdownOptions()}
                    placeholder={
                      <span class="text-muted-foreground">Select a Makara tenant</span>
                    }
                    value={selected()}
                    onChange={(v) => {
                      setSelected(v)
                      setDirty(true)
                    }}
                    itemComponent={(itemProps) => (
                      <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue<string>>
                        {(state) => <span>{state.selectedOption()}</span>}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </Show>
              </Show>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canSave()}
              loading={update.isPending}
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  )
}

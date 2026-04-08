import { Show, For } from "solid-js"
import { createQuery } from "@tanstack/solid-query"
import { api, type Tenant } from "~/api/client"
import { createTenantState } from "~/lib/tenant-state"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu"
import { SidebarSeparator } from "~/components/ui/sidebar"
import { Building2, ChevronDown } from "~/components/icons"

export default function TenantSelector() {
  const [currentTenant, setTenant] = createTenantState()

  const tenantsQuery = createQuery(() => ({
    queryKey: ["tenants"],
    queryFn: () => api.get<Tenant[]>("/tenants"),
    staleTime: Infinity,
  }))

  const currentDisplayName = () => {
    const tenants = tenantsQuery.data
    if (!tenants) return ""
    const match = tenants.find((t) => t.name === currentTenant())
    return match?.displayName ?? currentTenant()
  }

  const initTenant = () => {
    const tenants = tenantsQuery.data
    if (!tenants || tenants.length === 0) return
    if (!currentTenant() || !tenants.some((t) => t.name === currentTenant())) {
      setTenant(tenants[0].name)
    }
  }

  return (
    <Show when={tenantsQuery.data} fallback={null}>
      {(tenants) => {
        initTenant()
        return (
          <Show when={tenants().length >= 2}>
            <SidebarSeparator />
            <div class="px-2 py-1 group-data-[collapsible=icon]/sidebar:px-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                as={(props: Record<string, unknown>) => (
                  <button
                    {...props}
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-2 group-data-[collapsible=icon]/sidebar:py-2"
                  >
                    <Building2 class="w-4 h-4 shrink-0" />
                    <span class="truncate flex-1 text-left group-data-[collapsible=icon]/sidebar:hidden">
                      {currentDisplayName()}
                    </span>
                    <ChevronDown class="w-3 h-3 shrink-0 text-sidebar-muted-foreground group-data-[collapsible=icon]/sidebar:hidden" />
                  </button>
                )}
              />
              <DropdownMenuContent>
                <For each={tenants()}>
                  {(tenant) => (
                    <DropdownMenuItem
                      class={tenant.name === currentTenant() ? "bg-accent" : ""}
                      onSelect={() => setTenant(tenant.name)}
                    >
                      {tenant.displayName}
                    </DropdownMenuItem>
                  )}
                </For>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
            <SidebarSeparator />
          </Show>
        )
      }}
    </Show>
  )
}

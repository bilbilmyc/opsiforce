import { Show, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import { useNavigate } from "@tanstack/solid-router";
import { type Project } from "~/api/client";
import { usePermissions } from "~/api/permissions";
import { useCreateUnassignedProject } from "~/api/projects";
import { useCurrentUser, useUserInfo } from "~/api/user";
import { Permission } from "~/constants/permissions";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { Button } from "~/components/ui/button";
import TenantSelector from "~/components/tenant-selector";
import ProjectSidebar from "~/components/project-sidebar";
import {
  LogOut,
  Plus,
  FolderKanban,
  Wallet,
  ChevronsUpDown,
  Search,
  X,
  Calendar,
  SlidersHorizontal,
  Settings,
} from "~/components/icons";

export default function AppSidebar() {
  const navigate = useNavigate();
  const { toggleSidebar } = useSidebar();
  const { hasPermission } = usePermissions();
  const userInfo = useUserInfo();
  useCurrentUser();

  const [search, setSearch] = createSignal("");
  let searchRef: HTMLInputElement | undefined;

  const createUnassigned = useCreateUnassignedProject();

  const handleCreate = () =>
    createUnassigned.mutate(undefined, {
      onSuccess: (project: Project) => {
        toast.success("Project created");
        navigate({
          to: "/projects/$projectId",
          params: { projectId: project.id },
          search: { prompt: undefined },
        });
      },
      onError: () => toast.error("Failed to create project"),
    });

  const userName = () => userInfo.data?.preferredUsername ?? "";
  const userInitial = () => {
    const name = userName();
    return name ? name.charAt(0).toUpperCase() : "U";
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader class="gap-3 pb-0">
        <div class="flex items-center gap-2 px-1 py-0.5 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0">
          <div
            class="w-7 h-7 shrink-0 rounded-lg bg-foreground/5 border border-foreground/10 flex items-center justify-center cursor-pointer hover:bg-foreground/10 transition-colors"
            onClick={() => navigate({ to: "/" })}
            title="Home"
          >
            <img
              alt="Opsiforce"
              src="/assets/icons/brands/opsima.svg"
              class="w-4 h-4"
            />
          </div>
          <span class="font-semibold text-sm text-sidebar-foreground truncate group-data-[collapsible=icon]/sidebar:hidden">
            Opsiforce
          </span>
          <div class="ml-auto group-data-[collapsible=icon]/sidebar:hidden">
            <SidebarTrigger />
          </div>
        </div>
        <div class="hidden group-data-[collapsible=icon]/sidebar:flex justify-center">
          <SidebarTrigger />
        </div>

        <div class="group-data-[collapsible=icon]/sidebar:hidden flex items-center gap-1.5 pb-2">
          <div class="relative flex-1 min-w-0">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              ref={(el) => (searchRef = el)}
              type="text"
              placeholder="Search..."
              onInput={(e) => setSearch(e.currentTarget.value)}
              onBlur={(e) => {
                if (!e.relatedTarget) {
                  requestAnimationFrame(() => {
                    if (document.activeElement === document.body) {
                      searchRef?.focus();
                    }
                  });
                }
              }}
              class="flex h-8 w-full rounded-md border border-input bg-background py-1 pl-7 pr-7 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Show when={search()}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSearch("");
                  if (searchRef) {
                    searchRef.value = "";
                    searchRef.focus();
                  }
                }}
                class="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <X class="w-3 h-3" />
              </button>
            </Show>
          </div>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8 shrink-0"
            onClick={handleCreate}
            disabled={createUnassigned.isPending}
            title="New project"
          >
            <Plus class="w-4 h-4" />
          </Button>
        </div>
        <div class="hidden group-data-[collapsible=icon]/sidebar:flex justify-center pb-2">
          <button
            class="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            onClick={handleCreate}
            disabled={createUnassigned.isPending}
            title="New project"
          >
            <Plus class="w-4 h-4" />
          </button>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <div class="hidden group-data-[collapsible=icon]/sidebar:block px-2 py-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => toggleSidebar()}>
                <FolderKanban class="w-4 h-4 shrink-0" />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
        <div class="group-data-[collapsible=icon]/sidebar:hidden px-2 py-1">
          <ProjectSidebar search={search()} />
        </div>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <TenantSelector />

        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                as={(triggerProps: Record<string, unknown>) => (
                  <button
                    {...triggerProps}
                    class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]/sidebar:justify-center"
                  >
                    <div class="w-7 h-7 shrink-0 rounded-lg bg-sidebar-accent flex items-center justify-center text-sidebar-foreground">
                      <span class="text-xs font-semibold">{userInitial()}</span>
                    </div>
                    <div class="flex-1 min-w-0 text-left group-data-[collapsible=icon]/sidebar:hidden">
                      <span class="block text-sm font-medium truncate text-sidebar-foreground">
                        {userName()}
                      </span>
                    </div>
                    <ChevronsUpDown class="w-4 h-4 shrink-0 text-sidebar-muted-foreground group-data-[collapsible=icon]/sidebar:hidden" />
                  </button>
                )}
              />
              <DropdownMenuContent class="min-w-56">
                <div class="px-2 py-1.5">
                  <p class="text-sm font-medium truncate">{userName()}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => navigate({ to: "/schedules" })}
                >
                  <Calendar class="w-4 h-4 text-muted-foreground" />
                  Schedules
                </DropdownMenuItem>
                <Show when={hasPermission(Permission.manageWorkspaces)}>
                  <DropdownMenuItem
                    onSelect={() => navigate({ to: "/settings/workspaces" })}
                  >
                    <Settings class="w-4 h-4 text-muted-foreground" />
                    Workspaces
                  </DropdownMenuItem>
                </Show>
                <Show when={hasPermission(Permission.manageTenantBudget)}>
                  <DropdownMenuItem
                    onSelect={() => navigate({ to: "/billing" })}
                  >
                    <Wallet class="w-4 h-4 text-muted-foreground" />
                    Billing
                  </DropdownMenuItem>
                </Show>
                <Show
                  when={
                    hasPermission(Permission.managePlatformDefaults) ||
                    hasPermission(Permission.manageTenantDefaults)
                  }
                >
                  <DropdownMenuItem
                    onSelect={() => navigate({ to: "/defaults" })}
                  >
                    <SlidersHorizontal class="w-4 h-4 text-muted-foreground" />
                    Defaults
                  </DropdownMenuItem>
                </Show>
                <DropdownMenuItem
                  onSelect={() => {
                    window.location.href = "/oauth2/sign_out";
                  }}
                >
                  <LogOut class="w-4 h-4 text-muted-foreground" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

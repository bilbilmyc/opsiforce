import { createMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@tanstack/solid-router"
import { api, type Project } from "~/api/client"
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarSeparator,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar"
import TenantSelector from "~/components/tenant-selector"
import ProjectSidebar from "~/components/project-sidebar"
import { LogOut, Plus, FolderKanban } from "~/components/icons"

export default function AppSidebar() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { toggleSidebar } = useSidebar()

  const createProject = createMutation(() => ({
    mutationFn: () => api.post<Project>("/projects"),
    onSuccess: (project: Project) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      navigate({ to: "/projects/$projectId", params: { projectId: project.id } })
    },
  }))

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div class="flex items-center gap-2 px-1 py-0.5 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0">
          <img
            alt="Opsiforce"
            src="/assets/icons/brands/opsima.svg"
            class="w-7 h-7 shrink-0 cursor-pointer"
            onClick={() => navigate({ to: "/" })}
          />
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
      </SidebarHeader>

      <TenantSelector />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>Projects</span>
            <SidebarGroupAction
              onClick={() => createProject.mutate(undefined as never)}
              disabled={createProject.isPending}
              title="New project"
            >
              <Plus class="w-3.5 h-3.5" />
            </SidebarGroupAction>
          </SidebarGroupLabel>
          <div class="hidden group-data-[collapsible=icon]/sidebar:block">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => toggleSidebar()}>
                  <FolderKanban class="w-4 h-4 shrink-0" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
          <SidebarGroupContent class="group-data-[collapsible=icon]/sidebar:hidden">
            <ProjectSidebar />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => { window.location.href = "/oauth2/sign_out" }}>
              <LogOut class="w-4 h-4 shrink-0" />
              <span class="group-data-[collapsible=icon]/sidebar:hidden">Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

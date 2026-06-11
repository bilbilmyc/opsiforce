import { Show } from "solid-js"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { useProjects } from "~/api/projects"
import { Code as CodeIcon, Database, MessageSquare } from "~/components/icons"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import ProjectActionsMenu from "~/components/project-actions-menu"
import EnvSwitcher from "~/components/project/environments/env-switcher"
import EnvironmentsPopover from "~/components/project/environments/environments-popover"
import type { Project, ProjectStatus } from "~/api/client"
import type { ProjectEnvironment } from "~/api/environments"

export type ProjectTab = "chat" | "code" | "db"

export interface ProjectHeaderProps {
  projectId: string
  status: ProjectStatus
  workspaceId: string | null
  appExists: boolean
  showTabs: boolean
  activeTab: ProjectTab
  onActiveTabChange: (tab: ProjectTab) => void
  environments: ProjectEnvironment[]
  activeEnvironmentId: string
  onActiveEnvironmentChange: (environmentId: string) => void
  onDeleted: () => void
  onDuplicated: (p: Project) => void
}

export default function ProjectHeader(props: ProjectHeaderProps) {
  const { hasPermission } = usePermissions()
  const canViewCode = () => hasPermission(Permission.viewCodeTab)
  const canViewDb = () => hasPermission(Permission.viewDbTab)
  const hasExtraTabs = () => canViewCode() || canViewDb()
  const projects = useProjects()
  const project = () => projects.data?.find((p) => p.id === props.projectId)
  const hasMultipleEnvironments = () => props.environments.length > 1

  const handleEnvironmentDeleted = (environmentId: string) => {
    if (props.activeEnvironmentId === environmentId) {
      props.onActiveEnvironmentChange(props.projectId)
    }
  }

  return (
    <div class="flex items-center justify-between gap-2 px-3 py-2 bg-background border-b border-border shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <Show when={props.showTabs && hasExtraTabs()}>
          <Tabs
            value={props.activeTab}
            onChange={(v) => props.onActiveTabChange(v as ProjectTab)}
            class="w-auto"
          >
            <TabsList class="w-auto">
              <TabsTrigger value="chat" class="flex-none gap-1.5">
                <MessageSquare class="w-3.5 h-3.5" />
                Chat
              </TabsTrigger>
              <Show when={canViewCode()}>
                <TabsTrigger value="code" class="flex-none gap-1.5">
                  <CodeIcon class="w-3.5 h-3.5" />
                  Code
                </TabsTrigger>
              </Show>
              <Show when={canViewDb()}>
                <TabsTrigger value="db" class="flex-none gap-1.5">
                  <Database class="w-3.5 h-3.5" />
                  DB
                </TabsTrigger>
              </Show>
            </TabsList>
          </Tabs>
        </Show>
        <Show when={hasMultipleEnvironments()}>
          <EnvSwitcher
            environments={props.environments}
            activeEnvironmentId={props.activeEnvironmentId}
            onChange={props.onActiveEnvironmentChange}
          />
        </Show>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <EnvironmentsPopover
          projectId={props.projectId}
          onEnvironmentDeleted={handleEnvironmentDeleted}
        />
        <ProjectActionsMenu
          projectId={props.projectId}
          status={props.status}
          workspaceId={props.workspaceId}
          project={project()}
          activeEnvironmentId={props.activeEnvironmentId}
          onDeleted={props.onDeleted}
          onDuplicated={props.onDuplicated}
        />
      </div>
    </div>
  )
}

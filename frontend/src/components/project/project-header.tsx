import { Show } from "solid-js"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { Code as CodeIcon, Database, MessageSquare } from "~/components/icons"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import ProjectActionsMenu from "~/components/project-actions-menu"
import type { Project, ProjectStatus } from "~/api/client"

export type ProjectTab = "chat" | "code" | "db"

export interface ProjectHeaderProps {
  projectId: string
  status: ProjectStatus
  workspaceId: string | null
  showTabs: boolean
  activeTab: ProjectTab
  onActiveTabChange: (tab: ProjectTab) => void
  onDeleted: () => void
  onDuplicated: (p: Project) => void
}

export default function ProjectHeader(props: ProjectHeaderProps) {
  const { hasPermission } = usePermissions()
  const canViewCode = () => hasPermission(Permission.viewCodeTab)
  const canViewDb = () => hasPermission(Permission.viewDbTab)
  const hasExtraTabs = () => canViewCode() || canViewDb()

  return (
    <div class="flex items-center justify-between px-3 py-2 bg-background border-b border-border shrink-0">
      <div class="flex items-center">
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
      </div>
      <ProjectActionsMenu
        projectId={props.projectId}
        status={props.status}
        workspaceId={props.workspaceId}
        onDeleted={props.onDeleted}
        onDuplicated={props.onDuplicated}
      />
    </div>
  )
}

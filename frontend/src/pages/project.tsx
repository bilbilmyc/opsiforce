import { Show, createEffect, createMemo, createSignal, untrack } from "solid-js"
import { useNavigate } from "@tanstack/solid-router"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { ApiError } from "~/api/client"
import { useProjectStatus } from "~/api/projects"
import Spinner from "~/components/ui/spinner"
import ProjectHeader, { type ProjectTab } from "~/components/project/project-header"
import ProjectChatTab from "~/components/project/project-chat-tab"
import ProjectCodeTab from "~/components/project/project-code-tab"
import ProjectDbTab from "~/components/project/project-db-tab"
import ProjectPreviewPanel from "~/components/project/project-preview-panel"
import ProjectDisabled from "~/components/project/project-disabled"
import ProjectDuplicateProgress from "~/components/project/project-duplicate-progress"
import { useOpenCodeConnection } from "~/components/project/use-opencode-connection"

export default function ProjectView(props: { projectId: string; initialPrompt?: string }) {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canViewCode = () => hasPermission(Permission.viewCodeTab)
  const canViewDb = () => hasPermission(Permission.viewDbTab)

  const [activeTab, setActiveTab] = createSignal<ProjectTab>("chat")

  const projectId = () => props.projectId
  const statusQuery = useProjectStatus(projectId, {
    enabled: () => activeTab() === "chat",
  })
  const status = () => statusQuery.data?.status
  const duplicateOperation = createMemo(() => (status() !== "active" ? statusQuery.data?.operation : undefined))

  createEffect(() => {
    if (statusQuery.error instanceof ApiError && statusQuery.error.status === 404) {
      untrack(() => navigate({ to: "/" }))
    }
  })

  const connection = useOpenCodeConnection({
    projectId: props.projectId,
    status,
    initialPrompt: props.initialPrompt,
  })
  const app = () => statusQuery.data?.app

  let reloadPreview: () => void = () => {}
  const onReloadRef = (fn: () => void) => {
    reloadPreview = fn
  }

  return (
    <div class="h-full w-full flex flex-col overflow-hidden">
      <Show when={statusQuery.data}>
        {(data) => (
          <ProjectHeader
            projectId={props.projectId}
            status={data().status}
            workspaceId={data().workspaceId}
            showTabs={!!connection.router()}
            activeTab={activeTab()}
            onActiveTabChange={setActiveTab}
            onDeleted={() => navigate({ to: "/" })}
            onDuplicated={(p) =>
              navigate({
                to: "/projects/$projectId",
                params: { projectId: p.id },
                search: { prompt: undefined },
              })
            }
          />
        )}
      </Show>

      <div class="flex-1 min-h-0 flex">
        <div
          class="flex-1 min-w-0 flex flex-col oc-chat-only"
          style={{ display: activeTab() === "chat" ? "flex" : "none" }}
        >
          <Show when={status() !== "disabled"} fallback={<ProjectDisabled projectId={props.projectId} />}>
            <Show
              when={duplicateOperation()}
              fallback={
                <Show when={connection.router()} fallback={<Spinner label="Connecting..." />}>
                  {(router) => (
                    <ProjectChatTab
                      projectId={props.projectId}
                      router={router()}
                      onPreviewReload={() => reloadPreview()}
                    />
                  )}
                </Show>
              }
            >
              {(operation) => <ProjectDuplicateProgress operation={operation()} />}
            </Show>
          </Show>
        </div>

        <Show when={activeTab() === "code" && canViewCode()}>
          <ProjectCodeTab projectId={props.projectId} />
        </Show>

        <Show when={activeTab() === "db" && canViewDb()}>
          <ProjectDbTab projectId={props.projectId} />
        </Show>

        <Show when={app()?.exists ? app() : null}>
          {(meta) => (
            <ProjectPreviewPanel
              projectId={props.projectId}
              appName={meta().name ?? undefined}
              onReloadRef={onReloadRef}
            />
          )}
        </Show>
      </div>
    </div>
  )
}

import { Show, createEffect, createMemo, createSignal, untrack } from "solid-js"
import { useNavigate } from "@tanstack/solid-router"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { ApiError } from "~/api/client"
import { useProjectStatus } from "~/api/projects"
import { useProjectEnvironments, useSetEnvironmentSession } from "~/api/environments"
import Spinner from "~/components/ui/spinner"
import ProjectHeader, { type ProjectTab } from "~/components/project/project-header"
import ProjectChatTab from "~/components/project/project-chat-tab"
import ProjectCodeTab from "~/components/project/project-code-tab"
import ProjectDbTab from "~/components/project/project-db-tab"
import ProjectPreviewPanel from "~/components/project/project-preview-panel"
import ProjectDisabled from "~/components/project/project-disabled"
import ProjectFailed from "~/components/project/project-failed"
import ProjectDuplicateProgress from "~/components/project/project-duplicate-progress"
import EnvProdBanner from "~/components/project/environments/env-prod-banner"
import PublishJobsHost from "~/components/project/environments/publish-jobs-host"
import { useOpenCodeConnection } from "~/components/project/use-opencode-connection"

export default function ProjectView(props: { projectId: string; initialPrompt?: string }) {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canViewCode = () => hasPermission(Permission.viewCodeTab)
  const canViewDb = () => hasPermission(Permission.viewDbTab)

  const [activeTab, setActiveTab] = createSignal<ProjectTab>("chat")
  const [visitedTabs, setVisitedTabs] = createSignal<Set<ProjectTab>>(new Set<ProjectTab>(["chat"]))
  const [activeEnvironmentId, setActiveEnvironmentId] = createSignal(props.projectId)

  const selectTab = (tab: ProjectTab) => {
    setActiveTab(tab)
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)))
  }

  const projectId = () => props.projectId
  const statusQuery = useProjectStatus(projectId, {
    enabled: () => activeTab() === "chat",
  })
  const status = () => statusQuery.data?.status
  const duplicateOperation = createMemo(() => (status() !== "active" ? statusQuery.data?.operation : undefined))

  const environments = useProjectEnvironments(projectId)
  const environmentList = () => environments.data ?? []
  const activeEnvironment = createMemo(() =>
    environmentList().find((e) => e.id === activeEnvironmentId()),
  )
  const isDevelopmentActive = () => activeEnvironmentId() === props.projectId

  const connectionStatus = () =>
    isDevelopmentActive() ? status() : activeEnvironment()?.status

  createEffect(() => {
    if (props.projectId) {
      untrack(() => setActiveEnvironmentId(props.projectId))
    }
  })

  createEffect(() => {
    const list = environments.data
    if (!list || environments.isFetching) return
    const exists = list.some((e) => e.id === activeEnvironmentId())
    if (!exists) untrack(() => setActiveEnvironmentId(props.projectId))
  })

  createEffect(() => {
    if (isDevelopmentActive()) return
    if (activeEnvironment()?.status !== "suspended") return
    fetch(`/api/proxy/${activeEnvironmentId()}/ping`).catch(() => {})
  })

  createEffect(() => {
    if (statusQuery.error instanceof ApiError && statusQuery.error.status === 404) {
      untrack(() => navigate({ to: "/" }))
    }
  })

  const setEnvironmentSession = useSetEnvironmentSession()
  const rememberedSessionId = () => activeEnvironment()?.sessionId ?? null

  const connection = useOpenCodeConnection({
    projectId: props.projectId,
    environmentId: activeEnvironmentId,
    status: connectionStatus,
    rememberedSessionId,
    currentTitle: () => statusQuery.data?.title,
    onResolveSession: (envId, sessionId) =>
      setEnvironmentSession(props.projectId, envId, sessionId),
    initialPrompt: props.initialPrompt,
  })
  const app = () => statusQuery.data?.app

  let reloadPreview: () => void = () => {}
  const onReloadRef = (fn: () => void) => {
    reloadPreview = fn
  }

  return (
    <PublishJobsHost
      projectId={props.projectId}
      onJobDone={(job) => {
        if (job.projectEnvironmentId === activeEnvironmentId()) reloadPreview()
      }}
      onViewEnvironment={setActiveEnvironmentId}
    >
      <div class="h-full w-full flex flex-col overflow-hidden">
        <Show when={statusQuery.data}>
        {(data) => (
          <ProjectHeader
            projectId={props.projectId}
            status={data().status}
            workspaceId={data().workspaceId}
            appExists={!!data().app?.exists}
            showTabs={!!connection.router()}
            activeTab={activeTab()}
            onActiveTabChange={selectTab}
            environments={environmentList()}
            activeEnvironmentId={activeEnvironmentId()}
            onActiveEnvironmentChange={setActiveEnvironmentId}
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

      <Show when={!isDevelopmentActive()}>
        <EnvProdBanner
          environmentName={activeEnvironment()?.name ?? "this"}
          onSwitchToDevelopment={() => setActiveEnvironmentId(props.projectId)}
        />
      </Show>

      <div class="flex-1 min-h-0 flex">
        <div
          class="flex-1 min-w-0 flex flex-col oc-chat-only"
          style={{ display: activeTab() === "chat" ? "flex" : "none" }}
        >
          <Show when={connectionStatus() !== "disabled"} fallback={<ProjectDisabled projectId={props.projectId} />}>
            <Show when={connectionStatus() !== "failed"} fallback={<ProjectFailed projectId={props.projectId} />}>
              <Show
                when={duplicateOperation()}
                fallback={
                  <Show when={connection.router()} fallback={<Spinner label="Connecting..." />}>
                    {(router) => (
                      <ProjectChatTab
                        projectId={props.projectId}
                        environmentId={activeEnvironmentId()}
                        router={router()}
                        currentTitle={statusQuery.data?.title ?? null}
                        onPreviewReload={() => reloadPreview()}
                      />
                    )}
                  </Show>
                }
              >
                {(operation) => <ProjectDuplicateProgress operation={operation()} />}
              </Show>
            </Show>
          </Show>
        </div>

        <Show when={visitedTabs().has("code") && canViewCode()}>
          <div
            class="flex-1 min-w-0 flex flex-col"
            style={{ display: activeTab() === "code" ? "flex" : "none" }}
          >
            <ProjectCodeTab environmentId={activeEnvironmentId()} />
          </div>
        </Show>

        <Show when={visitedTabs().has("db") && canViewDb()}>
          <div
            class="flex-1 min-w-0 flex flex-col"
            style={{ display: activeTab() === "db" ? "flex" : "none" }}
          >
            <ProjectDbTab environmentId={activeEnvironmentId()} />
          </div>
        </Show>

        <Show when={app()?.exists ? app() : null}>
          {(meta) => (
            <ProjectPreviewPanel
              projectId={props.projectId}
              environmentId={activeEnvironmentId()}
              environmentSlug={activeEnvironment()?.slug ?? null}
              appName={meta().name ?? undefined}
              onReloadRef={onReloadRef}
            />
          )}
        </Show>
      </div>
      </div>
    </PublishJobsHost>
  )
}

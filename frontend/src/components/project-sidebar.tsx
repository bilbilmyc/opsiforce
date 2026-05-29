import { For, Show, createMemo, createSignal } from "solid-js"
import { useMatch, useNavigate } from "@tanstack/solid-router"
import { DragDropProvider, type DragDropProviderProps } from "@dnd-kit/solid"
import { isSortable } from "@dnd-kit/solid/sortable"
import { toast } from "solid-sonner"
import { type Project } from "~/api/client"
import { usePermissions } from "~/api/permissions"
import { useCreateUnassignedProject, useProjects, useRenameProject } from "~/api/projects"
import {
  PUBLIC_LABEL,
  useCreateProjectInWorkspace,
  useMoveProject,
  useWorkspaces,
} from "~/api/workspaces"
import { useUpdateWorkspacePreferences } from "~/api/users"
import { createPersistedSignal } from "~/lib/persisted-signal"
import { DndType, PUBLIC_ID } from "~/lib/sidebar-dnd"
import { Permission } from "~/constants/permissions"
import { FolderOpen } from "~/components/icons"
import Spinner from "~/components/ui/spinner"
import ProjectSettings from "./project-settings"
import WorkspaceSettings from "./workspace-settings"
import SidebarWorkspaceGroup from "./sidebar-workspace-group"
import SidebarPublicGroup from "./sidebar-public-group"

const FOLDED_KEY = "opsiforce:workspace:folded"
const PUBLIC_FOLDED_KEY = "opsiforce:workspace:public-folded"

type DragEndEvent = Parameters<NonNullable<DragDropProviderProps["onDragEnd"]>>[0]

export default function ProjectSidebar(props: { search: string }) {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()

  const canManageWorkspaces = () => hasPermission(Permission.manageWorkspaces)

  const projectMatch = useMatch({ from: "/projects/$projectId", shouldThrow: false })
  const activeProjectId = () => projectMatch()?.params.projectId

  const [settingsProjectId, setSettingsProjectId] = createSignal<string | null>(null)
  const [settingsWorkspaceId, setSettingsWorkspaceId] = createSignal<string | null>(null)

  const projects = useProjects()
  const workspaces = useWorkspaces()
  const updatePrefs = useUpdateWorkspacePreferences()
  const createInWs = useCreateProjectInWorkspace()
  const createUnassigned = useCreateUnassignedProject()
  const moveProject = useMoveProject()
  const renameProject = useRenameProject()

  const [folded, setFolded] = createPersistedSignal<Record<string, boolean>>(FOLDED_KEY, {})
  const [publicFolded, setPublicFolded] = createPersistedSignal<boolean>(
    PUBLIC_FOLDED_KEY,
    false,
  )

  const toggleFold = (id: string) => {
    if (id === PUBLIC_ID) {
      setPublicFolded(!publicFolded())
      return
    }
    setFolded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const isFolded = (id: string) =>
    id === PUBLIC_ID ? publicFolded() : !!folded()[id]

  const groupedProjects = createMemo(() => {
    const byWs = new Map<string, Project[]>()
    const publicProjects: Project[] = []
    for (const p of projects.data ?? []) {
      if (p.workspaceId) {
        const arr = byWs.get(p.workspaceId) ?? []
        arr.push(p)
        byWs.set(p.workspaceId, arr)
      } else {
        publicProjects.push(p)
      }
    }
    return { byWs, publicProjects }
  })

  const searchQuery = () => props.search.toLowerCase().trim()

  const filterByQuery = (list: Project[]) => {
    const q = searchQuery()
    if (!q) return list
    return list.filter((p) => (p.title ?? "").toLowerCase().includes(q))
  }

  // Auto-expand workspaces whose projects match the search.
  const shouldShowExpanded = (id: string) => {
    const q = searchQuery()
    if (q && filterByQuery(groupedProjects().byWs.get(id) ?? []).length > 0) return true
    return !isFolded(id)
  }

  const workspaceLabel = (id: string | null): string => {
    if (id === null) return PUBLIC_LABEL
    return (workspaces.data ?? []).find((w) => w.id === id)?.name ?? "workspace"
  }

  const reorderWorkspacesByIndex = (fromIdx: number, toIdx: number) => {
    const current = (workspaces.data ?? []).map((w) => w.id)
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= current.length || fromIdx === toIdx) return
    const next = [...current]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    updatePrefs.mutate({ workspaceOrder: next })
  }

  const navigateToProject = (projectId: string) =>
    navigate({
      to: "/projects/$projectId",
      params: { projectId },
      search: { prompt: undefined },
    })

  const handleCreateInWorkspace = async (workspaceId: string) => {
    try {
      const project = await createInWs.mutateAsync({ workspaceId })
      toast.success("Project created")
      navigateToProject(project.id)
    } catch {
      toast.error("Failed to create project")
    }
  }

  const handleCreateUnassigned = () =>
    createUnassigned.mutate(undefined, {
      onSuccess: (project) => {
        toast.success("Project created")
        navigateToProject(project.id)
      },
      onError: () => toast.error("Failed to create project"),
    })

  const handleWorkspaceReorder = (initialIndex: number, index: number) => {
    if (initialIndex === index) return
    reorderWorkspacesByIndex(initialIndex, index)
  }

  const privateWorkspaceId = createMemo(
    () => (workspaces.data ?? []).find((w) => w.type === "private")?.id,
  )

  const handleProjectMove = (
    projectId: string,
    initialGroup: string | undefined,
    group: string | undefined,
  ) => {
    if (initialGroup === group) return
    const priv = privateWorkspaceId()
    if (priv && group === priv) {
      toast.error("Public and workspace projects can't be made private")
      return
    }
    const fromWorkspaceId = initialGroup === PUBLIC_ID ? null : (initialGroup ?? null)
    const toWorkspaceId = group === PUBLIC_ID ? null : (group ?? null)
    moveProject.mutate({
      projectId,
      fromWorkspaceId,
      toWorkspaceId,
      fromName: workspaceLabel(fromWorkspaceId),
      toName: workspaceLabel(toWorkspaceId),
    })
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (event.canceled) return
    const { source, target } = event.operation
    if (!source || !isSortable(source)) return

    if (source.type === DndType.Workspace) {
      handleWorkspaceReorder(source.initialIndex, source.index)
      return
    }

    if (source.type === DndType.Project) {
      const initialGroup = source.initialGroup as string | undefined
      let group = source.group as string | undefined
      if (initialGroup === group && target && !isSortable(target)) {
        group = String(target.id)
      }
      const projectId = (source.data as { projectId: string }).projectId
      handleProjectMove(projectId, initialGroup, group)
    }
  }

  return (
    <>
      <Show
        when={workspaces.data && projects.data}
        fallback={
          <div class="py-10">
            <Spinner size="sm" />
          </div>
        }
      >
        <DragDropProvider onDragEnd={onDragEnd}>
          <div class="flex flex-col gap-1">
            <For each={workspaces.data}>
              {(ws, idx) => (
                <SidebarWorkspaceGroup
                  workspace={ws}
                  index={idx()}
                  expanded={shouldShowExpanded(ws.id)}
                  projects={filterByQuery(groupedProjects().byWs.get(ws.id) ?? [])}
                  activeProjectId={activeProjectId()}
                  creating={createInWs.isPending}
                  onToggleFold={() => toggleFold(ws.id)}
                  onOpenSettings={
                    ws.type !== "private" && canManageWorkspaces()
                      ? () => setSettingsWorkspaceId(ws.id)
                      : undefined
                  }
                  onCreate={() => handleCreateInWorkspace(ws.id)}
                  onSelectProject={navigateToProject}
                  onRenameProject={(id, title) => renameProject.mutate({ id, title })}
                  onProjectSettings={(id) => setSettingsProjectId(id)}
                  onProjectDeleted={(id) => {
                    if (id === activeProjectId()) navigate({ to: "/" })
                  }}
                  onProjectDuplicated={(p) => navigateToProject(p.id)}
                />
              )}
            </For>

            <SidebarPublicGroup
              expanded={!isFolded(PUBLIC_ID)}
              projects={filterByQuery(groupedProjects().publicProjects)}
              activeProjectId={activeProjectId()}
              creating={createUnassigned.isPending}
              canCreate={canManageWorkspaces()}
              onToggleFold={() => toggleFold(PUBLIC_ID)}
              onCreate={handleCreateUnassigned}
              onSelectProject={navigateToProject}
              onRenameProject={(id, title) => renameProject.mutate({ id, title })}
              onProjectSettings={(id) => setSettingsProjectId(id)}
              onProjectDeleted={(id) => {
                if (id === activeProjectId()) navigate({ to: "/" })
              }}
              onProjectDuplicated={(p) => navigateToProject(p.id)}
            />

            <Show
              when={(workspaces.data?.length ?? 0) === 0 && (projects.data?.length ?? 0) === 0}
            >
              <div class="flex flex-col items-center justify-center py-8 px-4 text-center">
                <FolderOpen
                  class="w-10 h-10 text-muted-foreground/30 mb-3"
                  stroke-width="1"
                />
                <p class="text-xs text-muted-foreground">No workspaces or projects yet</p>
                <Show
                  when={canManageWorkspaces()}
                  fallback={
                    <p class="text-xs text-muted-foreground/60 mt-0.5">
                      Ask an admin to add you to a workspace.
                    </p>
                  }
                >
                  <p class="text-xs text-muted-foreground/60 mt-0.5">
                    Create a workspace from settings to get started.
                  </p>
                </Show>
              </div>
            </Show>
          </div>
        </DragDropProvider>
      </Show>

      <Show when={settingsProjectId()}>
        {(id) => (
          <ProjectSettings
            projectId={id()}
            open={true}
            onOpenChange={(open) => {
              if (!open) setSettingsProjectId(null)
            }}
          />
        )}
      </Show>

      <Show when={settingsWorkspaceId()}>
        {(id) => (
          <WorkspaceSettings
            workspaceId={id()}
            open={true}
            onOpenChange={(open) => {
              if (!open) setSettingsWorkspaceId(null)
            }}
          />
        )}
      </Show>
    </>
  )
}

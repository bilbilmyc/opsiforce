import { For, Show, createMemo, createSignal } from "solid-js"
import { createMutation, useQueryClient } from "@tanstack/solid-query"
import { toast } from "solid-sonner"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { api, type Project } from "~/api/client"
import { useRestartProjectEnvironment } from "~/api/environments"
import { PUBLIC_LABEL, useMoveProject, useWorkspaces } from "~/api/workspaces"
import {
  ArrowRightLeft,
  Ban,
  ChevronRight,
  CirclePlay,
  Copy,
  EllipsisVertical,
  FolderKanban,
  Globe,
  Pencil,
  RotateCcw,
  Settings,
  Trash2,
} from "~/components/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import ProjectSettings from "./project-settings"
import ConfirmDialog from "./ui/confirm-dialog"

interface PendingMove {
  toWorkspaceId: string | null
  toName: string
}

export default function ProjectActionsMenu(props: {
  projectId: string
  status: Project["status"]
  workspaceId: string | null
  project?: Project
  activeEnvironmentId?: string
  showRename?: boolean
  onRename?: () => void
  onSettings?: () => void
  onDeleted?: () => void
  onDuplicated?: (project: Project) => void
  triggerClass?: string
  onTriggerClick?: (e: MouseEvent) => void
}) {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()

  const canSeeSettings = () =>
    hasPermission(Permission.manageProjectBudgetSettings) ||
    hasPermission(Permission.manageProjectTimeoutSettings) ||
    hasPermission(Permission.manageProjectLoggingSettings) ||
    hasPermission(Permission.manageProjectPodSettings)
  const canDisable = () => hasPermission(Permission.disableProject)
  const canRestart = () => hasPermission(Permission.restartProject)
  const canDuplicate = () => hasPermission(Permission.duplicateProject)
  const canManageWorkspaces = () => hasPermission(Permission.manageWorkspaces)
  const isDisabled = () => props.status === "disabled"

  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [confirmAction, setConfirmAction] = createSignal<
    "delete" | "duplicate" | "disable" | "restart" | null
  >(null)
  const [pendingMove, setPendingMove] = createSignal<PendingMove | null>(null)

  const workspaces = useWorkspaces()
  const move = useMoveProject()

  const moveTargets = createMemo(() => (workspaces.data ?? []).filter((w) => w.id !== props.workspaceId))

  const currentWorkspaceName = createMemo(() => {
    if (props.workspaceId === null) return PUBLIC_LABEL
    return (workspaces.data ?? []).find((w) => w.id === props.workspaceId)?.name ?? "workspace"
  })

  const showMove = () =>
    moveTargets().length > 0 || (canManageWorkspaces() && props.workspaceId !== null)

  const projectTitle = () => props.project?.title?.trim() || "Untitled project"

  const confirmMove = () => {
    const target = pendingMove()
    if (!target) return
    move.mutate({
      projectId: props.projectId,
      fromWorkspaceId: props.workspaceId,
      toWorkspaceId: target.toWorkspaceId,
      fromName: currentWorkspaceName(),
      toName: target.toName,
    })
  }

  const deleteProject = createMutation(() => ({
    mutationFn: () => api.delete<void>(`/projects/${props.projectId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      props.onDeleted?.()
    },
  }))

  const duplicateProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/duplicate`),
    onSuccess: (p: Project) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      toast.success("Duplicate started")
      props.onDuplicated?.(p)
    },
    onError: () => toast.error("Failed to duplicate project"),
  }))

  const disableProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/disable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

  const enableProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/enable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

  const restartProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/restart`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.refetchQueries({ queryKey: ["projects", props.projectId] })
    },
  }))

  const restartEnvironment = useRestartProjectEnvironment()

  const isDevelopmentActive = () =>
    !props.activeEnvironmentId || props.activeEnvironmentId === props.projectId

  const handleRestart = () => {
    if (isDevelopmentActive()) {
      restartProject.mutate(undefined as never)
      return
    }
    const environmentId = props.activeEnvironmentId
    if (!environmentId) return
    restartEnvironment.mutate({ projectId: props.projectId, environmentId })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          class={
            props.triggerClass ??
            "inline-flex items-center justify-center rounded-md w-7 h-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          }
          onClick={(e: MouseEvent) => props.onTriggerClick?.(e)}
          aria-label="Project actions"
        >
          <EllipsisVertical class="w-4 h-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e: MouseEvent) => e.stopPropagation()}>
          <Show when={props.showRename && props.onRename}>
            <DropdownMenuItem onSelect={() => props.onRename?.()}>
              <Pencil class="w-3.5 h-3.5 text-muted-foreground" />
              Rename
            </DropdownMenuItem>
          </Show>
          <Show when={canDuplicate()}>
            <DropdownMenuItem onSelect={() => setConfirmAction("duplicate")}>
              <Copy class="w-3.5 h-3.5 text-muted-foreground" />
              Duplicate
            </DropdownMenuItem>
          </Show>
          <Show when={canRestart() && !isDisabled()}>
            <DropdownMenuItem onSelect={() => setConfirmAction("restart")}>
              <RotateCcw class="w-3.5 h-3.5 text-muted-foreground" />
              Restart
            </DropdownMenuItem>
          </Show>
          <Show when={canDisable()}>
            <Show
              when={isDisabled()}
              fallback={
                <DropdownMenuItem onSelect={() => setConfirmAction("disable")}>
                  <Ban class="w-3.5 h-3.5 text-muted-foreground" />
                  Disable
                </DropdownMenuItem>
              }
            >
              <DropdownMenuItem onSelect={() => enableProject.mutate(undefined as never)}>
                <CirclePlay class="w-3.5 h-3.5 text-muted-foreground" />
                Enable
              </DropdownMenuItem>
            </Show>
          </Show>
          <Show when={canSeeSettings()}>
            <DropdownMenuItem
              onSelect={() => {
                if (props.onSettings) props.onSettings()
                else setSettingsOpen(true)
              }}
            >
              <Settings class="w-3.5 h-3.5 text-muted-foreground" />
              Settings
            </DropdownMenuItem>
          </Show>
          <Show when={showMove()}>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowRightLeft class="w-3.5 h-3.5 text-muted-foreground" />
                Move to
                <ChevronRight class="ml-auto w-3.5 h-3.5 text-muted-foreground" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <For each={moveTargets()}>
                  {(ws) => (
                    <DropdownMenuItem
                      onSelect={() => setPendingMove({ toWorkspaceId: ws.id, toName: ws.name })}
                    >
                      <FolderKanban class="w-3.5 h-3.5 text-muted-foreground" />
                      {ws.name}
                    </DropdownMenuItem>
                  )}
                </For>
                <Show when={canManageWorkspaces() && props.workspaceId !== null}>
                  <Show when={moveTargets().length > 0}>
                    <DropdownMenuSeparator />
                  </Show>
                  <DropdownMenuItem
                    onSelect={() => setPendingMove({ toWorkspaceId: null, toName: PUBLIC_LABEL })}
                  >
                    <Globe class="w-3.5 h-3.5 text-muted-foreground" />
                    {PUBLIC_LABEL}
                  </DropdownMenuItem>
                </Show>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </Show>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="text-destructive data-[highlighted]:text-destructive"
            onSelect={() => setConfirmAction("delete")}
          >
            <Trash2 class="w-3.5 h-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Show when={!props.onSettings}>
        <ProjectSettings
          projectId={props.projectId}
          activeEnvironmentId={props.activeEnvironmentId}
          open={settingsOpen()}
          onOpenChange={setSettingsOpen}
        />
      </Show>

      <ConfirmDialog
        open={pendingMove() !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMove(null)
        }}
        title="Move project"
        description={
          pendingMove()
            ? `Move "${projectTitle()}" from ${currentWorkspaceName()} to ${pendingMove()?.toName}?`
            : ""
        }
        confirmLabel="Move"
        onConfirm={confirmMove}
      />

      <ConfirmDialog
        open={confirmAction() === "delete"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Delete project"
        description="This will permanently delete the project and all its data. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteProject.mutate(undefined as never)}
      />

      <ConfirmDialog
        open={confirmAction() === "disable"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Disable project"
        description="This will shut down the project. The project data will be preserved and the project can be re-enabled later."
        confirmLabel="Disable"
        variant="destructive"
        onConfirm={() => disableProject.mutate(undefined as never)}
      />

      <ConfirmDialog
        open={confirmAction() === "duplicate"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Duplicate project"
        description="This will create a copy of the project with the same workspace files."
        confirmLabel="Duplicate"
        onConfirm={() => duplicateProject.mutate(undefined as never)}
      />

      <ConfirmDialog
        open={confirmAction() === "restart"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null)
        }}
        title="Restart project"
        description="Are you sure you want to restart this project? Project data will be preserved."
        confirmLabel="Restart"
        variant="destructive"
        onConfirm={handleRestart}
      />
    </>
  )
}

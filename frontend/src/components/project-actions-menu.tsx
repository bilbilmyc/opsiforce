import { Show, createSignal } from "solid-js"
import { createMutation, useQueryClient } from "@tanstack/solid-query"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { api, type Project } from "~/api/client"
import {
  Settings,
  Pencil,
  Copy,
  Trash2,
  Ban,
  CirclePlay,
  EllipsisVertical,
} from "~/components/icons"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu"
import ProjectSettings from "./project-settings"
import ConfirmDialog from "./ui/confirm-dialog"

export default function ProjectActionsMenu(props: {
  projectId: string
  status: Project["status"]
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
    hasPermission(Permission.manageProjectTimeoutSettings)
  const canDisable = () => hasPermission(Permission.disableProject)
  const canDuplicate = () => hasPermission(Permission.duplicateProject)
  const isDisabled = () => props.status === "disabled"

  const [settingsOpen, setSettingsOpen] = createSignal(false)
  const [confirmAction, setConfirmAction] = createSignal<"delete" | "duplicate" | "disable" | null>(null)

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
      props.onDuplicated?.(p)
    },
  }))

  const disableProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/disable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

  const enableProject = createMutation(() => ({
    mutationFn: () => api.post<Project>(`/projects/${props.projectId}/enable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  }))

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
        <DropdownMenuContent>
          <Show when={props.showRename && props.onRename}>
            <DropdownMenuItem onSelect={() => props.onRename?.()}>
              <Pencil class="w-3.5 h-3.5 text-muted-foreground" />
              Rename
            </DropdownMenuItem>
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
          <Show when={canDuplicate()}>
            <DropdownMenuItem onSelect={() => setConfirmAction("duplicate")}>
              <Copy class="w-3.5 h-3.5 text-muted-foreground" />
              Duplicate
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
          open={settingsOpen()}
          onOpenChange={setSettingsOpen}
        />
      </Show>

      <ConfirmDialog
        open={confirmAction() === "delete"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Delete project"
        description="This will permanently delete the project and all its data. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => deleteProject.mutate(undefined as never)}
      />

      <ConfirmDialog
        open={confirmAction() === "disable"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Disable project"
        description="This will shut down the project's pod. The workspace data will be preserved and the project can be re-enabled later."
        confirmLabel="Disable"
        variant="destructive"
        onConfirm={() => disableProject.mutate(undefined as never)}
      />

      <ConfirmDialog
        open={confirmAction() === "duplicate"}
        onOpenChange={(open) => { if (!open) setConfirmAction(null) }}
        title="Duplicate project"
        description="This will create a copy of the project with the same workspace files."
        confirmLabel="Duplicate"
        onConfirm={() => duplicateProject.mutate(undefined as never)}
      />
    </>
  )
}

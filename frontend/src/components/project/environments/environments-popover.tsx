import { For, Show, createMemo, createSignal } from "solid-js"
import { useNavigate } from "@tanstack/solid-router"
import { toast } from "solid-sonner"
import { usePermissions } from "~/api/permissions"
import { Permission } from "~/constants/permissions"
import { useProjects } from "~/api/projects"
import {
  useDeleteProjectEnvironment,
  useProjectEnvironments,
  useRestartProjectEnvironment,
  type ProjectEnvironment,
} from "~/api/environments"
import { usePublishTargets, type PublishTarget } from "~/api/publish"
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover"
import { Layers } from "~/components/icons"
import ConfirmDialog from "~/components/ui/confirm-dialog"
import Skeleton from "~/components/ui/skeleton"
import ProjectAuthDialog from "~/components/project-auth-dialog"
import PinAppDialogs, { type PinDialogAction } from "../pin-app-dialogs"
import EnvManageRow from "./env-manage-row"
import EnvTargetRow from "./env-target-row"
import PublishDialog from "./publish-dialog"
import EnvironmentVariablesDialog from "./environment-variables-dialog"

export interface EnvironmentsPopoverProps {
  projectId: string
  onEnvironmentDeleted?: (environmentId: string) => void
}

export default function EnvironmentsPopover(props: EnvironmentsPopoverProps) {
  const { hasPermission } = usePermissions()
  const canManageAuth = () => hasPermission(Permission.manageProjectAuthSettings)
  const canPin = () => hasPermission(Permission.pinApps)
  const canRestart = () => hasPermission(Permission.restartProject)
  const canDelete = () => hasPermission(Permission.deleteEnvironment)
  const canPublish = () => hasPermission(Permission.publishProject)
  const canManageVariables = () => hasPermission(Permission.manageEnvironmentVariables)

  const navigate = useNavigate()
  const [open, setOpen] = createSignal(false)

  const environments = useProjectEnvironments(() => props.projectId, {
    enabled: open,
  })
  const targets = usePublishTargets(() => props.projectId, {
    enabled: () => open() && canPublish(),
  })
  const projects = useProjects({ enabled: open })
  const hasApp = () => projects.data?.find((p) => p.id === props.projectId)?.hasApp === true

  const restart = useRestartProjectEnvironment()
  const remove = useDeleteProjectEnvironment()

  const [authEnv, setAuthEnv] = createSignal<ProjectEnvironment | null>(null)
  const [variablesEnv, setVariablesEnv] = createSignal<ProjectEnvironment | null>(null)
  const [publishTarget, setPublishTarget] = createSignal<PublishTarget | null>(null)
  const [pinAction, setPinAction] = createSignal<PinDialogAction>(null)
  const [pinEnvironmentId, setPinEnvironmentId] = createSignal<string | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = createSignal<ProjectEnvironment | null>(null)
  const [pendingRestart, setPendingRestart] = createSignal<ProjectEnvironment | null>(null)
  const [restartingId, setRestartingId] = createSignal<string | null>(null)

  const developmentRow = createMemo(() => environments.data?.find((e) => e.isDefault) ?? null)

  const targetRows = createMemo(() => {
    const instances = environments.data ?? []
    if (canPublish() && targets.data) {
      return targets.data.map((target) => ({
        target,
        instance: instances.find((i) => i.id === target.projectEnvironmentId) ?? null,
      }))
    }
    return instances
      .filter((instance) => !instance.isDefault)
      .map((instance) => ({ target: null, instance }))
  })

  const loading = () => environments.isPending || (canPublish() && targets.isPending)

  const description = () =>
    canPin()
      ? "Publish the app, manage auth and variables, pin to the Makara catalog, or open schedules."
      : "Publish the app, manage auth and variables, or open schedules."

  const openSchedules = (env: ProjectEnvironment) => {
    setOpen(false)
    navigate({
      to: "/schedules",
      search: { projectEnvironmentId: env.id, projectId: env.projectId },
    })
  }

  const confirmRestart = () => {
    const env = pendingRestart()
    if (!env) return
    setRestartingId(env.id)
    restart.mutate(
      { projectId: props.projectId, environmentId: env.id },
      {
        onSuccess: () => toast.success(`Restarting ${env.name}`),
        onError: () => toast.error(`Failed to restart ${env.name}`),
        onSettled: () => setRestartingId(null),
      },
    )
  }

  const confirmDelete = () => {
    const env = pendingDelete()
    if (!env) return
    remove.mutate(
      { projectId: props.projectId, environmentId: env.id },
      {
        onSuccess: () => {
          toast.success(`${env.name} deleted`)
          props.onEnvironmentDeleted?.(env.id)
        },
        onError: () => toast.error(`Failed to delete ${env.name}`),
      },
    )
  }

  const rowProps = (env: ProjectEnvironment, target: PublishTarget | null) => ({
    environment: env,
    hasApp: hasApp(),
    canManageAuth: canManageAuth(),
    canPin: canPin(),
    canRestart: canRestart(),
    canDelete: canDelete(),
    canPublish: canPublish() && target !== null,
    canManageVariables: canManageVariables(),
    restarting: restartingId() === env.id,
    onAuth: () => setAuthEnv(env),
    onVariables: () => setVariablesEnv(env),
    onPublish: () => setPublishTarget(target),
    onPin: () => {
      setPinEnvironmentId(env.id)
      setPinAction("pin")
    },
    onUnpin: () => {
      setPinEnvironmentId(undefined)
      setPinAction("unpin")
    },
    onSchedules: () => openSchedules(env),
    onRestart: () => setPendingRestart(env),
    onDelete: () => setPendingDelete(env),
  })

  return (
    <>
      <Popover open={open()} onOpenChange={setOpen} placement="bottom-end">
        <PopoverTrigger class="inline-flex h-7 items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring">
          <Layers class="h-3.5 w-3.5" />
          Environments
        </PopoverTrigger>
        <PopoverContent class="w-[26rem] p-0">
          <div class="border-b border-border px-4 pb-3 pt-3.5">
            <p class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers class="h-4 w-4 text-muted-foreground" />
              Environments
            </p>
            <p class="mt-1 text-xs text-muted-foreground">{description()}</p>
          </div>

          <div class="max-h-[55vh] space-y-0.5 overflow-y-auto p-1.5">
            <Show
              when={!loading()}
              fallback={
                <div class="space-y-1.5 p-1">
                  <Skeleton class="h-11 w-full" />
                  <Skeleton class="h-11 w-full" />
                </div>
              }
            >
              <Show when={developmentRow()}>
                {(env) => <EnvManageRow {...rowProps(env(), null)} />}
              </Show>
              <For each={targetRows()}>
                {(row) => (
                  <Show
                    when={row.instance}
                    fallback={
                      <Show when={row.target}>
                        {(target) => (
                          <EnvTargetRow
                            target={target()}
                            hasApp={hasApp()}
                            canPublish={canPublish()}
                            onPublish={() => setPublishTarget(target())}
                          />
                        )}
                      </Show>
                    }
                  >
                    {(env) => <EnvManageRow {...rowProps(env(), row.target)} />}
                  </Show>
                )}
              </For>
            </Show>
          </div>
        </PopoverContent>
      </Popover>

      <ProjectAuthDialog
        projectId={props.projectId}
        environmentId={authEnv()?.id ?? ""}
        environmentName={authEnv()?.name}
        open={authEnv() !== null}
        onOpenChange={(value) => {
          if (!value) setAuthEnv(null)
        }}
      />

      <EnvironmentVariablesDialog
        projectId={props.projectId}
        environment={variablesEnv()}
        onOpenChange={(value) => {
          if (!value) setVariablesEnv(null)
        }}
      />

      <Show when={canPublish()}>
        <PublishDialog
          projectId={props.projectId}
          target={publishTarget()}
          open={publishTarget() !== null}
          onOpenChange={(value) => {
            if (!value) setPublishTarget(null)
          }}
        />
      </Show>

      <PinAppDialogs
        projectId={props.projectId}
        environmentId={pinEnvironmentId()}
        action={pinAction()}
        onActionChange={setPinAction}
      />

      <ConfirmDialog
        open={pendingRestart() !== null}
        onOpenChange={(value) => {
          if (!value) setPendingRestart(null)
        }}
        title="Restart environment"
        description={`Are you sure you want to restart the ${pendingRestart()?.name ?? ""} environment? The running app will briefly go offline while it restarts.`}
        confirmLabel="Restart"
        variant="destructive"
        onConfirm={confirmRestart}
      />

      <ConfirmDialog
        open={pendingDelete() !== null}
        onOpenChange={(value) => {
          if (!value) setPendingDelete(null)
        }}
        title="Delete environment"
        description={`This permanently deletes the ${pendingDelete()?.name ?? ""} environment and its running app. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </>
  )
}

import { Show } from "solid-js"
import {
  Calendar,
  EllipsisVertical,
  Pin,
  PinOff,
  Rocket,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "~/components/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Button } from "~/components/ui/button"
import EnvStatusDot from "./env-status-dot"
import EnvAppLinkButtons from "./env-app-link-buttons"
import PinBadge from "../pin-badge"
import type { ProjectEnvironment } from "~/api/environments"

export interface EnvManageRowProps {
  environment: ProjectEnvironment
  hasApp: boolean
  canManageAuth: boolean
  canPin: boolean
  canRestart: boolean
  canDelete: boolean
  canPublish: boolean
  canManageVariables: boolean
  restarting: boolean
  onAuth: () => void
  onPin: () => void
  onUnpin: () => void
  onSchedules: () => void
  onRestart: () => void
  onDelete: () => void
  onPublish: () => void
  onVariables: () => void
}

export default function EnvManageRow(props: EnvManageRowProps) {
  const env = () => props.environment
  const isDevelopment = () => env().isDefault
  const isPublic = () => env().authMode === "public"
  const canDeleteEnv = () => props.canDelete && !isDevelopment()
  const canRestartEnv = () => props.canRestart && env().status !== "disabled"
  const showPublish = () => props.canPublish && !isDevelopment() && props.hasApp

  const appRunning = () => (isDevelopment() ? props.hasApp : env().deployedCommitSha !== null)
  const appUrl = () => `https://${env().id}.${import.meta.env.VITE_WEBAPP_DOMAIN}/`

  return (
    <div class="rounded-md px-2.5 py-2 transition-colors hover:bg-accent/50">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-xs font-semibold text-foreground">{env().name}</span>
          <EnvAppLinkButtons
            appUrl={appUrl()}
            enabled={appRunning()}
            disabledReason={
              isDevelopment()
                ? "No app is running here yet"
                : "Publish first — no app is running here yet"
            }
          />
          <EnvStatusDot status={env().status} withLabel />
          <Show when={props.canPin}>
            <PinBadge isPinned={env().isPinned} compact />
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-1.5">
          <Show when={showPublish()}>
            <Button size="sm" variant="outline" class="h-7 px-2.5" onClick={() => props.onPublish()}>
              <Rocket class="h-3.5 w-3.5" />
              {env().deployedCommitSha !== null ? "Publish update" : "Publish"}
            </Button>
          </Show>
          <DropdownMenu>
            <DropdownMenuTrigger
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={props.restarting}
              aria-label="Environment actions"
            >
              <EllipsisVertical class="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <Show when={props.canManageAuth}>
                <DropdownMenuItem onSelect={() => props.onAuth()}>
                  <ShieldCheck class="h-3.5 w-3.5 text-muted-foreground" />
                  Auth
                </DropdownMenuItem>
              </Show>
              <Show when={props.canManageVariables}>
                <DropdownMenuItem onSelect={() => props.onVariables()}>
                  <SlidersHorizontal class="h-3.5 w-3.5 text-muted-foreground" />
                  Environment variables
                </DropdownMenuItem>
              </Show>
              <Show when={props.canPin && props.hasApp && env().isPinned}>
                <DropdownMenuItem onSelect={() => props.onUnpin()}>
                  <PinOff class="h-3.5 w-3.5 text-muted-foreground" />
                  Unpin from Makara
                </DropdownMenuItem>
              </Show>
              <Show when={props.canPin && props.hasApp && !env().isPinned}>
                <DropdownMenuItem disabled={!isPublic()} onSelect={() => props.onPin()}>
                  <Pin class="h-3.5 w-3.5 text-muted-foreground" />
                  {isPublic() ? "Pin to Makara" : "Pin to Makara (set auth public first)"}
                </DropdownMenuItem>
              </Show>
              <DropdownMenuItem onSelect={() => props.onSchedules()}>
                <Calendar class="h-3.5 w-3.5 text-muted-foreground" />
                Schedules
              </DropdownMenuItem>
              <Show when={canRestartEnv()}>
                <DropdownMenuItem onSelect={() => props.onRestart()}>
                  <RotateCcw class="h-3.5 w-3.5 text-muted-foreground" />
                  Restart
                </DropdownMenuItem>
              </Show>
              <Show when={canDeleteEnv()}>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  class="text-destructive data-[highlighted]:text-destructive"
                  onSelect={() => props.onDelete()}
                >
                  <Trash2 class="h-3.5 w-3.5 text-destructive" />
                  Delete
                </DropdownMenuItem>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}

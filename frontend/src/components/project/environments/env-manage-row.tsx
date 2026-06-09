import { Show } from "solid-js"
import {
  Calendar,
  EllipsisVertical,
  ExternalLink,
  Pin,
  PinOff,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "~/components/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import EnvStatusDot from "./env-status-dot"
import PinBadge from "../pin-badge"
import type { ProjectEnvironment } from "~/api/environments"

export interface EnvManageRowProps {
  environment: ProjectEnvironment
  hasApp: boolean
  canManageAuth: boolean
  canPin: boolean
  canRestart: boolean
  canDelete: boolean
  restarting: boolean
  onAuth: () => void
  onPin: () => void
  onUnpin: () => void
  onSchedules: () => void
  onRestart: () => void
  onDelete: () => void
}

export default function EnvManageRow(props: EnvManageRowProps) {
  const env = () => props.environment
  const isDevelopment = () => env().isDefault
  const isPublic = () => env().authMode === "public"
  const canDeleteEnv = () => props.canDelete && !isDevelopment()
  const canRestartEnv = () => props.canRestart && env().status !== "disabled"

  const appUrl = () => `https://${env().id}.${import.meta.env.VITE_WEBAPP_DOMAIN}/`
  const openApp = () => window.open(appUrl(), "_blank", "noopener,noreferrer")

  return (
    <div class="rounded-lg border border-border bg-background p-3">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-xs font-semibold text-foreground">{env().name}</span>
          <EnvStatusDot status={env().status} withLabel />
          <PinBadge isPinned={env().isPinned} compact />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={props.restarting}
            aria-label="Environment actions"
          >
            <EllipsisVertical class="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => openApp()}>
              <ExternalLink class="h-3.5 w-3.5 text-muted-foreground" />
              Open app
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Show when={props.canManageAuth}>
              <DropdownMenuItem onSelect={() => props.onAuth()}>
                <ShieldCheck class="h-3.5 w-3.5 text-muted-foreground" />
                Auth
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
  )
}

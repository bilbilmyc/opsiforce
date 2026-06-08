import { Show } from "solid-js"
import { ExternalLink, RotateCcw, Trash2 } from "~/components/icons"
import EnvStatusDot from "./env-status-dot"
import type { ProjectEnvironment } from "~/api/environments"

export interface EnvManageRowProps {
  environment: ProjectEnvironment
  canRestart: boolean
  canDelete: boolean
  restarting: boolean
  onRestart: () => void
  onDelete: () => void
}

export default function EnvManageRow(props: EnvManageRowProps) {
  const env = () => props.environment
  const isDevelopment = () => env().isDefault
  const canDeleteEnv = () => props.canDelete && !isDevelopment()

  const appUrl = () => `https://${env().id}.${import.meta.env.VITE_WEBAPP_DOMAIN}/`

  return (
    <div class="rounded-lg border border-border bg-background p-3">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate text-xs font-semibold text-foreground">{env().name}</span>
            <EnvStatusDot status={env().status} withLabel />
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Show when={props.canRestart}>
            <button
              type="button"
              onClick={props.onRestart}
              disabled={props.restarting}
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              title="Restart environment"
              aria-label="Restart environment"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </button>
          </Show>
          <Show when={canDeleteEnv()}>
            <button
              type="button"
              onClick={props.onDelete}
              class="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Delete environment"
              aria-label="Delete environment"
            >
              <Trash2 class="h-3.5 w-3.5" />
            </button>
          </Show>
        </div>
      </div>

      <div class="mt-2.5 flex flex-wrap gap-1.5">
        <a
          href={appUrl()}
          target="_blank"
          rel="noreferrer"
          class="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          App
          <ExternalLink class="h-3 w-3" />
        </a>
      </div>
    </div>
  )
}

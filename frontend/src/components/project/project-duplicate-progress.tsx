import { createMemo, Show } from "solid-js"
import type { ProjectOperation } from "~/api/client"
import { Copy, LoaderCircle } from "~/components/icons"

interface ProjectDuplicateProgressProps {
  operation: ProjectOperation
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (minutes === 0) return `${remainder}s`
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`
}

export default function ProjectDuplicateProgress(props: ProjectDuplicateProgressProps) {
  const percent = createMemo(() => {
    if (props.operation.bytesTotal <= 0) return 0
    return Math.min(100, Math.round((props.operation.bytesCopied / props.operation.bytesTotal) * 100))
  })

  const elapsed = createMemo(() => {
    if (!props.operation.startedAt) return undefined
    const startedAt = new Date(props.operation.startedAt).getTime()
    const completedAt = props.operation.completedAt ? new Date(props.operation.completedAt).getTime() : Date.now()
    return formatDuration(completedAt - startedAt)
  })

  const title = createMemo(() => {
    if (props.operation.status === "failed") return "Duplicate failed"
    if (props.operation.status === "starting") return "Starting copied project"
    if (props.operation.status === "queued") return "Preparing duplicate"
    return "Duplicating project files"
  })

  const detail = createMemo(() => {
    if (props.operation.status === "failed") return props.operation.error ?? "Copy failed"
    if (props.operation.status === "starting") {
      return props.operation.startedAt ? `Copied in ${elapsed()}` : "Copy complete"
    }
    if (props.operation.bytesTotal > 0) {
      return `${formatBytes(props.operation.bytesCopied)} of ${formatBytes(props.operation.bytesTotal)}`
    }
    return elapsed() ? `Elapsed ${elapsed()}` : "Queued"
  })

  return (
    <div class="h-full w-full flex items-center justify-center px-6">
      <div class="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="h-9 w-9 shrink-0 rounded-md border border-border bg-muted/40 flex items-center justify-center">
            <Show when={props.operation.status === "failed"} fallback={<LoaderCircle class="h-4 w-4 animate-spin text-muted-foreground" />}>
              <Copy class="h-4 w-4 text-destructive" />
            </Show>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-foreground">{title()}</div>
            <div class="mt-0.5 text-xs text-muted-foreground truncate">{detail()}</div>
          </div>
          <Show when={props.operation.status === "copying" && props.operation.bytesTotal > 0}>
            <div class="text-xs tabular-nums text-muted-foreground">{percent()}%</div>
          </Show>
        </div>

        <Show when={props.operation.status !== "failed"}>
          <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-foreground transition-all duration-300"
              style={{
                width: props.operation.bytesTotal > 0 ? `${percent()}%` : "35%",
              }}
            />
          </div>
        </Show>
      </div>
    </div>
  )
}

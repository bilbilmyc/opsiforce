import { Show } from "solid-js"
import { Rocket } from "~/components/icons"
import { Button } from "~/components/ui/button"
import EnvAppLinkButtons from "./env-app-link-buttons"
import type { PublishTarget } from "~/api/publish"

export interface EnvTargetRowProps {
  target: PublishTarget
  hasApp: boolean
  canPublish: boolean
  onPublish: () => void
}

export default function EnvTargetRow(props: EnvTargetRowProps) {
  return (
    <div class="rounded-md border border-dashed border-border/80 px-2.5 py-2">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-xs font-semibold text-foreground">{props.target.name}</span>
          <EnvAppLinkButtons
            appUrl=""
            enabled={false}
            disabledReason="Publish first — no app is running here yet"
          />
          <span class="text-xs text-muted-foreground">Not published yet</span>
        </div>
        <Show when={props.canPublish && props.hasApp}>
          <Button size="sm" variant="outline" class="h-7 shrink-0 px-2.5" onClick={() => props.onPublish()}>
            <Rocket class="h-3.5 w-3.5" />
            Publish
          </Button>
        </Show>
      </div>
    </div>
  )
}

import { Show } from "solid-js"
import { cn } from "~/lib/cn"
import { appPublicUrl } from "~/lib/app-url"
import { Check, ExternalLink, Layers, LoaderCircle, X } from "~/components/icons"
import { PUBLISH_STEPS, publishStepIndex } from "./publish-steps"
import type { TrackedPublish } from "./publish-jobs-context"

export interface PublishProgressCardProps {
  entry: TrackedPublish
  onExpand: () => void
  onDismiss: () => void
  onViewEnvironment: () => void
}

export default function PublishProgressCard(props: PublishProgressCardProps) {
  const job = () => props.entry.job
  const isDone = () => job()?.status === "done"
  const isFailed = () => job()?.status === "failed"
  const isTerminal = () => isDone() || isFailed()

  const stepLabel = () => {
    const current = job()
    if (!current) return "Starting"
    const index = publishStepIndex(current.status)
    const step = PUBLISH_STEPS[index]
    return `${step?.label ?? "Working"} · step ${index + 1} of ${PUBLISH_STEPS.length}`
  }

  const appUrl = () => {
    const current = job()
    if (!current) return null
    return appPublicUrl(current.projectEnvironmentId, props.entry.environmentSlug)
  }

  const progressPercent = () => {
    const current = job()
    const index = current ? publishStepIndex(current.status) : 0
    return ((index + 1) / PUBLISH_STEPS.length) * 100
  }

  return (
    <div
      class={cn(
        "pointer-events-auto relative w-72 cursor-pointer rounded-lg border bg-popover p-3 shadow-lg transition-shadow hover:shadow-xl animate-in fade-in-0 slide-in-from-bottom-2",
        isFailed() && "border-destructive/50",
        isDone() && "border-emerald-500/50",
        !isTerminal() && "border-primary/40",
      )}
      role="button"
      tabIndex={0}
      onClick={() => props.onExpand()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") props.onExpand()
      }}
    >
      <span class="pointer-events-none absolute inset-0 rounded-lg animate-publish-arrive" />
      <div class="flex items-start gap-2.5">
        <Show
          when={!isTerminal()}
          fallback={
            <Show
              when={isDone()}
              fallback={
                <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive text-white">
                  <X class="h-3 w-3" />
                </span>
              }
            >
              <span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check class="h-3 w-3" />
              </span>
            </Show>
          }
        >
          <LoaderCircle class="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
        </Show>

        <div class="min-w-0 flex-1">
          <Show
            when={!isTerminal()}
            fallback={
              <Show
                when={isDone()}
                fallback={
                  <>
                    <p class="text-xs font-semibold text-destructive">
                      Publish to {props.entry.environmentName} failed
                    </p>
                    <Show when={job()?.error}>
                      <p class="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">
                        {job()?.error}
                      </p>
                    </Show>
                  </>
                }
              >
                <p class="text-xs font-semibold text-foreground">
                  {props.entry.environmentName} is live
                </p>
                <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Show when={appUrl()}>
                    {(url) => (
                      <a
                        href={url()}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink class="h-3 w-3 shrink-0" />
                        Open app
                      </a>
                    )}
                  </Show>
                  <button
                    class="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      props.onViewEnvironment()
                    }}
                  >
                    <Layers class="h-3 w-3 shrink-0" />
                    View environment
                  </button>
                </div>
              </Show>
            }
          >
            <p class="text-xs font-semibold text-foreground">
              Publishing to {props.entry.environmentName}
            </p>
            <p class="mt-0.5 text-xs text-muted-foreground">{stepLabel()}</p>
          </Show>
        </div>

        <Show when={isTerminal()}>
          <button
            class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation()
              props.onDismiss()
            }}
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </Show>
      </div>

      <Show when={!isTerminal()}>
        <div class="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPercent()}%` }}
          />
        </div>
      </Show>
    </div>
  )
}

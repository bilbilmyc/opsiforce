import { For, Show } from "solid-js"
import { Check, LoaderCircle, X } from "~/components/icons"
import { cn } from "~/lib/cn"
import type { PublishJob } from "~/api/publish"
import { PUBLISH_STEPS, publishStepIndex } from "./publish-steps"

type StepState = "done" | "active" | "pending" | "failed"

export interface PublishProgressProps {
  job: PublishJob
  environmentName: string
}

export default function PublishProgress(props: PublishProgressProps) {
  const isFailed = () => props.job.status === "failed"
  const isDone = () => props.job.status === "done"
  const currentIndex = () => publishStepIndex(props.job.status)

  const stepState = (index: number): StepState => {
    if (isDone()) return "done"
    if (index < currentIndex()) return "done"
    if (index === currentIndex()) return isFailed() ? "failed" : "active"
    return "pending"
  }

  return (
    <div class="mt-4">
      <Show
        when={isDone()}
        fallback={
          <Show when={isFailed()}>
            <div class="mb-4 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5">
              <X class="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <div class="min-w-0 text-xs text-foreground">
                <p class="font-medium text-destructive">Publish failed</p>
                <Show when={props.job.error}>
                  <p class="mt-0.5 break-words text-muted-foreground">{props.job.error}</p>
                </Show>
              </div>
            </div>
          </Show>
        }
      >
        <div class="mb-4 flex items-start gap-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
          <Check class="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <div class="min-w-0 text-xs text-foreground">
            <p class="font-medium text-emerald-700">
              {props.environmentName} is live
            </p>
            <p class="mt-0.5 text-muted-foreground">The app is now running the new build.</p>
          </div>
        </div>
      </Show>

      <ol class="relative space-y-1">
        <For each={PUBLISH_STEPS}>
          {(step, index) => {
            const state = () => stepState(index())
            const isLast = index() === PUBLISH_STEPS.length - 1
            return (
              <li class="relative flex gap-3 pb-1">
                <div class="relative flex flex-col items-center">
                  <StepMarker state={state()} />
                  <Show when={!isLast}>
                    <span
                      class={cn(
                        "absolute top-5 h-[calc(100%-0.25rem)] w-px",
                        state() === "done" ? "bg-emerald-500/40" : "bg-border",
                      )}
                    />
                  </Show>
                </div>
                <div class="min-w-0 pb-2">
                  <p
                    class={cn(
                      "text-xs font-medium leading-5 transition-colors",
                      state() === "active" && "text-foreground",
                      state() === "done" && "text-foreground",
                      state() === "failed" && "text-destructive",
                      state() === "pending" && "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </p>
                  <Show when={state() === "active" || state() === "failed"}>
                    <p class="text-xs text-muted-foreground">{step.detail}</p>
                  </Show>
                </div>
              </li>
            )
          }}
        </For>
      </ol>
    </div>
  )
}

function StepMarker(props: { state: StepState }) {
  return (
    <span
      class={cn(
        "z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors",
        props.state === "done" && "border-emerald-500 bg-emerald-500 text-white",
        props.state === "active" && "border-primary text-primary",
        props.state === "failed" && "border-destructive bg-destructive text-white",
        props.state === "pending" && "border-border text-muted-foreground",
      )}
    >
      <Show when={props.state === "done"}>
        <Check class="h-3 w-3" />
      </Show>
      <Show when={props.state === "active"}>
        <LoaderCircle class="h-3 w-3 animate-spin" />
      </Show>
      <Show when={props.state === "failed"}>
        <X class="h-3 w-3" />
      </Show>
    </span>
  )
}

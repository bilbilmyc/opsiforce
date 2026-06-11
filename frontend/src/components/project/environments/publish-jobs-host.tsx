import { For, Show, createSignal, onCleanup, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useQueryClient } from "@tanstack/solid-query"
import { environmentKeys } from "~/api/environments"
import { publishKeys, type PublishJob } from "~/api/publish"
import {
  PublishJobsContext,
  type StartPublishInput,
  type TrackedPublish,
} from "./publish-jobs-context"
import PublishProgressCard from "./publish-progress-card"
import PublishProgressDialog from "./publish-progress-dialog"

export interface PublishJobsHostProps {
  projectId: string
  onJobDone?: (job: PublishJob) => void
  onViewEnvironment?: (environmentId: string) => void
}

export default function PublishJobsHost(props: ParentProps<PublishJobsHostProps>) {
  const qc = useQueryClient()
  const [tracked, setTracked] = createStore<Record<string, TrackedPublish>>({})
  const [expandedId, setExpandedId] = createSignal<string | null>(null)
  const sources = new Map<string, EventSource>()

  const closeStream = (environmentId: string) => {
    sources.get(environmentId)?.close()
    sources.delete(environmentId)
  }

  const openStream = (environmentId: string) => {
    if (sources.has(environmentId)) return
    const tenant = localStorage.getItem("tenant")
    const query = tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""
    const source = new EventSource(
      `/api/projects/${props.projectId}/publish/environments/${environmentId}/job/stream${query}`,
    )

    source.onmessage = (event) => {
      try {
        const job = JSON.parse(event.data) as PublishJob
        if (!tracked[environmentId]) return
        setTracked(environmentId, "job", job)
        if (job.status === "done" || job.status === "failed") {
          qc.invalidateQueries({ queryKey: environmentKeys.forProject(props.projectId) })
          qc.invalidateQueries({ queryKey: publishKeys.targets(props.projectId) })
          closeStream(environmentId)
          if (job.status === "done") props.onJobDone?.(job)
        }
      } catch {
        // ignore malformed frames
      }
    }

    sources.set(environmentId, source)
  }

  const start = (input: StartPublishInput) => {
    setTracked(input.environmentId, {
      environmentId: input.environmentId,
      environmentName: input.environmentName,
      job: null,
    })
    setExpandedId(input.environmentId)
    openStream(input.environmentId)
  }

  const dismiss = (environmentId: string) => {
    closeStream(environmentId)
    if (expandedId() === environmentId) setExpandedId(null)
    setTracked(
      produce((draft) => {
        delete draft[environmentId]
      }),
    )
  }

  onCleanup(() => {
    sources.forEach((source) => source.close())
    sources.clear()
  })

  const viewEnvironment = (environmentId: string) => {
    props.onViewEnvironment?.(environmentId)
    dismiss(environmentId)
  }

  const entries = () => Object.values(tracked)
  const expandedEntry = () => {
    const id = expandedId()
    return id ? tracked[id] : undefined
  }

  return (
    <PublishJobsContext.Provider value={{ start }}>
      {props.children}

      <Show when={entries().length > 0}>
        <div class="pointer-events-none fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
          <For each={entries()}>
            {(entry) => (
              <Show when={expandedId() !== entry.environmentId}>
                <PublishProgressCard
                  entry={entry}
                  onExpand={() => setExpandedId(entry.environmentId)}
                  onDismiss={() => dismiss(entry.environmentId)}
                  onViewEnvironment={() => viewEnvironment(entry.environmentId)}
                />
              </Show>
            )}
          </For>
        </div>
      </Show>

      <Show when={expandedEntry()}>
        {(entry) => (
          <PublishProgressDialog
            entry={entry()}
            onMinimize={() => setExpandedId(null)}
            onDismiss={() => dismiss(entry().environmentId)}
            onViewEnvironment={() => viewEnvironment(entry().environmentId)}
          />
        )}
      </Show>
    </PublishJobsContext.Provider>
  )
}

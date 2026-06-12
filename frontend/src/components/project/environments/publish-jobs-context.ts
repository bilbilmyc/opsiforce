import { createContext, useContext } from "solid-js"
import type { PublishJob } from "~/api/publish"

export interface StartPublishInput {
  environmentId: string
  environmentName: string
}

export interface TrackedPublish {
  environmentId: string
  environmentName: string
  job: PublishJob | null
}

export interface PublishJobsApi {
  start: (input: StartPublishInput) => void
  entries: () => TrackedPublish[]
}

export const PublishJobsContext = createContext<PublishJobsApi>()

export function usePublishJobs(): PublishJobsApi {
  const ctx = useContext(PublishJobsContext)
  if (!ctx) throw new Error("usePublishJobs must be used within PublishJobsHost")
  return ctx
}

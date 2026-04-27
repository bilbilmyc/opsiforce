import { createEffect, type Accessor } from "solid-js"
import { createQuery, useQueryClient } from "@tanstack/solid-query"
import { api, type ProjectStatus } from "~/api/client"
import { projectKeys } from "~/api/projects"

interface AppMeta {
  exists?: boolean
  name?: string
  description?: string
}

const POLL_INTERVAL_MS = 3000

export function useWebappPreview(options: {
  projectId: string
  status: Accessor<ProjectStatus | undefined>
}) {
  const qc = useQueryClient()

  const query = createQuery(() => ({
    queryKey: projectKeys.appMeta(options.projectId),
    queryFn: () => api.get<AppMeta>(`/projects/${options.projectId}/app-meta`),
    enabled: options.status() === "active",
    refetchInterval: (q: { state: { data: AppMeta | undefined } }) => {
      if (q.state.data?.exists) return false
      return POLL_INTERVAL_MS
    },
  }))

  let prevStatus: ProjectStatus | undefined
  createEffect(() => {
    const current = options.status()
    const isRestart =
      current === "starting" && prevStatus && prevStatus !== "starting"
    if (current === "disabled" || isRestart) {
      qc.removeQueries({ queryKey: projectKeys.appMeta(options.projectId) })
    }
    prevStatus = current
  })

  return {
    ready: () => query.data?.exists === true,
    appName: () => query.data?.name,
    recheck: () => query.refetch(),
  }
}

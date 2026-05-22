import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { ApiError, api, type Project, type ProjectState } from "./client"
import { detectTimezone } from "~/lib/timezone"

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
}

interface ProjectStatusErrorPayload {
  code: "not_found" | "forbidden" | "internal"
  message?: string
}

export function useProjectStatus(projectId: () => string, options?: { enabled?: () => boolean }) {
  const [data, setData] = createSignal<ProjectState>()
  const [error, setError] = createSignal<unknown>()

  const applyStatus = (status: ProjectState) => {
    setData(status)
    setError(undefined)
    if (status.status === "suspended") {
      fetch(`/api/proxy/${status.id}/ping`).catch(() => {})
    }
  }

  createEffect(() => {
    const id = projectId()
    const enabled = options?.enabled?.() ?? true
    if (!enabled) return

    let closed = false
    const events = new EventSource(statusEventsUrl(id))

    events.onmessage = (event) => {
      try {
        applyStatus(JSON.parse(event.data) as ProjectState)
      } catch (err) {
        setError(err)
      }
    }

    events.addEventListener("error", (event) => {
      if (closed) return
      const data = (event as MessageEvent).data
      if (typeof data === "string" && data.length > 0) {
        try {
          const payload = JSON.parse(data) as ProjectStatusErrorPayload
          const status = statusForCode(payload.code)
          setError(new ApiError(status, payload.message ?? `Error: ${status}`))
          closed = true
          events.close()
          return
        } catch {
          // fall through to generic disconnect
        }
      }
      setError(new Error("Project status stream disconnected"))
    })

    onCleanup(() => {
      closed = true
      events.close()
    })
  })

  return {
    get data() {
      return data()
    },
    get error() {
      return error()
    },
  }
}

function statusForCode(code: ProjectStatusErrorPayload["code"]): number {
  if (code === "not_found") return 404
  if (code === "forbidden") return 403
  return 500
}

function statusEventsUrl(projectId: string): string {
  const params = new URLSearchParams()
  const tenant = localStorage.getItem("tenant")
  if (tenant) params.set("tenant", tenant)
  const query = params.toString()
  return `/api/projects/${projectId}/events${query ? `?${query}` : ""}`
}

export function useProjects(options?: { enabled?: () => boolean }) {
  return createQuery(() => ({
    queryKey: projectKeys.list(),
    queryFn: () => api.get<Project[]>("/projects"),
    enabled: options?.enabled ? options.enabled() : true,
    reconcile: "id",
  }))
}

export function useRenameProject() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { id: string; title: string }) => api.patch<Project>(`/projects/${params.id}`, { title: params.title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  }))
}

export function useCreateUnassignedProject() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (dto: { title?: string; description?: string } | void) =>
      api.post<Project>("/projects", {
        timezone: detectTimezone(),
        ...(dto ?? {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      qc.invalidateQueries({ queryKey: ["workspaces"] })
    },
  }))
}

export function useSetAppPin() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { projectId: string; isPinned: boolean }) =>
      api.patch<Project>(`/projects/${params.projectId}/app/pin`, { isPinned: params.isPinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  }))
}

export interface UpdateAppPayload {
  name?: string
  description?: string | null
}

export function useUpdateApp() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { projectId: string; payload: UpdateAppPayload }) =>
      api.patch<Project>(`/projects/${params.projectId}/app`, params.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  }))
}

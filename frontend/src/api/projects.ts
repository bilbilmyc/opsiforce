import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { api, type Project, type ProjectStatusResponse } from "./client"

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
  status: (id: string) => [...projectKeys.all, id, "status"] as const,
  appMeta: (id: string) => [...projectKeys.all, id, "app-meta"] as const,
}

export function useProjectStatus(projectId: () => string, options?: { enabled?: () => boolean }) {
  const [data, setData] = createSignal<ProjectStatusResponse>()
  const [error, setError] = createSignal<unknown>()
  let sequence = 0

  const applyStatus = (status: ProjectStatusResponse) => {
    setData(status)
    setError(undefined)
    if (status.status === "suspended") {
      fetch(`/api/proxy/${status.id}/ping`).catch(() => {})
    }
  }

  createEffect(() => {
    const id = projectId()
    const enabled = options?.enabled?.() ?? true
    const currentSequence = ++sequence
    if (!enabled) return

    let closed = false
    void api
      .get<ProjectStatusResponse>(`/projects/${id}/status`)
      .then((status) => {
        if (!closed && currentSequence === sequence) applyStatus(status)
      })
      .catch((err) => {
        if (!closed && currentSequence === sequence) setError(err)
      })

    const events = new EventSource(statusEventsUrl(id))

    events.onmessage = (event) => {
      try {
        applyStatus(JSON.parse(event.data) as ProjectStatusResponse)
      } catch (err) {
        setError(err)
      }
    }

    events.addEventListener("close", () => {
      events.close()
    })

    events.onerror = () => {
      if (!closed) setError(new Error("Project status stream disconnected"))
    }

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

function statusEventsUrl(projectId: string): string {
  const params = new URLSearchParams()
  const tenant = localStorage.getItem("tenant")
  if (tenant) params.set("tenant", tenant)
  const query = params.toString()
  return `/api/projects/${projectId}/status/events${query ? `?${query}` : ""}`
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

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "UTC"
  }
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

import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { api, type Project, type ProjectStatusResponse } from "./client"

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
  status: (id: string) => [...projectKeys.all, id, "status"] as const,
  appMeta: (id: string) => [...projectKeys.all, id, "app-meta"] as const,
}

export function useProjectStatus(
  projectId: () => string,
  options?: { enabled?: () => boolean },
) {
  return createQuery(() => ({
    queryKey: projectKeys.status(projectId()),
    queryFn: async () => {
      const id = projectId()
      const data = await api.get<ProjectStatusResponse>(`/projects/${id}/status`)
      if (data.status === "suspended") {
        fetch(`/api/proxy/${id}/ping`).catch(() => {})
      }
      return data
    },
    enabled: options?.enabled?.() ?? true,
    refetchInterval: (query: { state: { data: ProjectStatusResponse | undefined; error: unknown } }) => {
      const { data, error } = query.state
      if (error) return false
      if (!data) return 3000
      if (data.status === "disabled") return false
      return data.status === "starting" || data.status === "suspended" ? 3000 : false
    },
  }))
}

export function useProjects(options?: { enabled?: () => boolean }) {
  return createQuery(() => ({
    queryKey: projectKeys.list(),
    queryFn: () => api.get<Project[]>("/projects"),
    enabled: options?.enabled ? options.enabled() : true,
  }))
}

export function useRenameProject() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { id: string; title: string }) =>
      api.patch<Project>(`/projects/${params.id}`, { title: params.title }),
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
      api.post<Project>("/projects", { timezone: detectTimezone(), ...(dto ?? {}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      qc.invalidateQueries({ queryKey: ["workspaces"] })
    },
  }))
}

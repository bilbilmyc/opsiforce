import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { api, type Project } from "./client"

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (id: string) => [...projectKeys.all, id] as const,
}

export function useProjects(options?: { enabled?: () => boolean }) {
  return createQuery(() => ({
    queryKey: projectKeys.list(),
    queryFn: () => api.get<Project[]>("/projects"),
    enabled: options?.enabled ? options.enabled() : true,
    staleTime: 30_000,
  }))
}

/**
 * Rename a project. Handy helper since a few components do this in-place.
 */
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

/**
 * Create a project outside any workspace. Admin-only on the backend.
 * Auto-includes the caller's timezone (the project.schedules table needs it).
 * Use useCreateProjectInWorkspace for workspace-scoped creation.
 */
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

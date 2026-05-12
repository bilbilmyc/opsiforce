import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { toast } from "solid-sonner"
import { api, type Project, type User, type Workspace } from "./client"

export const workspaceKeys = {
  all: ["workspaces"] as const,
  list: (scope: "member" | "all" = "member") =>
    [...workspaceKeys.all, "list", scope] as const,
  detail: (id: string) => [...workspaceKeys.all, id] as const,
  members: (id: string) => [...workspaceKeys.all, id, "members"] as const,
  projects: (id: string) => [...workspaceKeys.all, id, "projects"] as const,
}

export function useWorkspaces(scope: "member" | "all" = "member") {
  return createQuery(() => ({
    queryKey: workspaceKeys.list(scope),
    queryFn: () =>
      api.get<Workspace[]>(scope === "all" ? "/workspaces?scope=all" : "/workspaces"),
    reconcile: "id",
    refetchOnWindowFocus: false
  }))
}

export function useWorkspace(workspaceId: () => string | null) {
  return createQuery(() => ({
    queryKey: workspaceKeys.detail(workspaceId() ?? ""),
    queryFn: () => api.get<Workspace>(`/workspaces/${workspaceId()}`),
    enabled: !!workspaceId(),
  }))
}

export function useWorkspaceMembers(workspaceId: () => string | null) {
  return createQuery(() => ({
    queryKey: workspaceKeys.members(workspaceId() ?? ""),
    queryFn: () => api.get<User[]>(`/workspaces/${workspaceId()}/members`),
    enabled: !!workspaceId(),
  }))
}

export function useWorkspaceProjects(workspaceId: () => string | null) {
  return createQuery(() => ({
    queryKey: workspaceKeys.projects(workspaceId() ?? ""),
    queryFn: () => api.get<Project[]>(`/workspaces/${workspaceId()}/projects`),
    enabled: !!workspaceId(),
  }))
}

export function useCreateWorkspace() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (dto: { name: string; description?: string | null }) =>
      api.post<Workspace>("/workspaces", dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: workspaceKeys.all }),
  }))
}

export function useUpdateWorkspace() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: {
      id: string
      dto: { name?: string; description?: string | null }
    }) => api.patch<Workspace>(`/workspaces/${params.id}`, params.dto),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.all })
      qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.id) })
    },
  }))
}

export function useDeleteWorkspace() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (id: string) => api.delete<void>(`/workspaces/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workspaceKeys.all })
      qc.invalidateQueries({ queryKey: ["projects"] })
    },
  }))
}

export function useAddWorkspaceMember() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { workspaceId: string; userId: string }) =>
      api.post<void>(`/workspaces/${params.workspaceId}/members`, { userId: params.userId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: workspaceKeys.all })
    },
  }))
}

export function useRemoveWorkspaceMember() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { workspaceId: string; userId: string }) =>
      api.delete<void>(`/workspaces/${params.workspaceId}/members/${params.userId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: workspaceKeys.members(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: workspaceKeys.all })
    },
  }))
}

export function useCreateProjectInWorkspace() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: {
      workspaceId: string
      dto?: { title?: string; description?: string; agentId?: string }
    }) => api.post<Project>(`/workspaces/${params.workspaceId}/projects`, params.dto ?? {}),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: workspaceKeys.projects(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.workspaceId) })
      qc.invalidateQueries({ queryKey: workspaceKeys.all })
    },
  }))
}

/**
 * Move a project to a target workspace (or null to unassign). Idempotent.
 * Callers pass `fromName` / `toName` so the success toast can read
 * "Project moved from X to Y" without a second lookup.
 */
export interface MoveProjectVars {
  projectId: string
  fromWorkspaceId: string | null
  toWorkspaceId: string | null
  fromName: string
  toName: string
}

export function useMoveProject() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: async (params: MoveProjectVars) => {
      if (params.toWorkspaceId === null) {
        const fromId = params.fromWorkspaceId
        if (fromId === null) return
        return api.delete<Project>(`/workspaces/${fromId}/projects/${params.projectId}`)
      }
      return api.post<Project>(
        `/workspaces/${params.toWorkspaceId}/projects/${params.projectId}`,
      )
    },
    onSuccess: (_data, vars) => {
      toast.success(`Project moved from ${vars.fromName} to ${vars.toName}`)
      qc.invalidateQueries({ queryKey: ["projects"] })
      qc.invalidateQueries({ queryKey: workspaceKeys.all })
      if (vars.fromWorkspaceId) {
        qc.invalidateQueries({ queryKey: workspaceKeys.projects(vars.fromWorkspaceId) })
        qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.fromWorkspaceId) })
      }
      if (vars.toWorkspaceId) {
        qc.invalidateQueries({ queryKey: workspaceKeys.projects(vars.toWorkspaceId) })
        qc.invalidateQueries({ queryKey: workspaceKeys.detail(vars.toWorkspaceId) })
      }
    },
    onError: () => toast.error("Failed to move project"),
  }))
}

export const PUBLIC_LABEL = "Public"

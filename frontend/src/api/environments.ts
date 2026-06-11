import { createMutation, useQueryClient } from "@tanstack/solid-query"
import { createAppQuery } from "~/lib/create-app-query"
import { api } from "./client"
import { projectKeys } from "./projects"

export type ProjectEnvironmentStatus =
  | "starting"
  | "active"
  | "suspended"
  | "disabled"
  | "failed"
  | "pending"
  | "claiming"
  | "publishing"

export interface Environment {
  id: string
  name: string
  description: string | null
  isDefault: boolean
  isProtected: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectEnvironment {
  id: string
  projectId: string
  environmentId: string
  name: string
  isDefault: boolean
  status: ProjectEnvironmentStatus
  authMode: string
  deployedCommitSha: string | null
  lastActiveAt: string | null
  isPinned: boolean
  sessionId: string | null
}

export interface CreateEnvironmentDto {
  name: string
  description?: string
}

export interface UpdateEnvironmentDto {
  name?: string
  description?: string
}

export const environmentKeys = {
  all: ["environments"] as const,
  registry: () => [...environmentKeys.all, "registry"] as const,
  forProject: (projectId: string) => [...projectKeys.detail(projectId), "environments"] as const,
}

export function useEnvironments(options?: { enabled?: () => boolean }) {
  return createAppQuery(() => ({
    queryKey: environmentKeys.registry(),
    queryFn: () => api.get<Environment[]>("/environments"),
    enabled: options?.enabled ? options.enabled() : true,
  }))
}

export function useCreateEnvironment() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (dto: CreateEnvironmentDto) => api.post<Environment>("/environments", dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: environmentKeys.all }),
  }))
}

export function useUpdateEnvironment() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { id: string; dto: UpdateEnvironmentDto }) =>
      api.patch<Environment>(`/environments/${params.id}`, params.dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: environmentKeys.all }),
  }))
}

export function useDeleteEnvironment() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/environments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: environmentKeys.all }),
  }))
}

export function useProjectEnvironments(projectId: () => string, options?: { enabled?: () => boolean }) {
  return createAppQuery(() => ({
    queryKey: environmentKeys.forProject(projectId()),
    queryFn: () => api.get<ProjectEnvironment[]>(`/projects/${projectId()}/environments`),
    enabled: options?.enabled ? options.enabled() : true,
  }))
}

export function useSetEnvironmentSession() {
  const qc = useQueryClient()
  return (projectId: string, environmentId: string, sessionId: string | null) => {
    qc.setQueryData<ProjectEnvironment[]>(environmentKeys.forProject(projectId), (prev) =>
      prev?.map((e) => (e.id === environmentId ? { ...e, sessionId } : e)),
    )
    api
      .patch<{ ok: true }>(`/projects/${projectId}/environments/${environmentId}/session`, { sessionId })
      .catch(() => {})
  }
}

export function useRestartProjectEnvironment() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { projectId: string; environmentId: string }) =>
      api.post<void>(`/projects/${params.projectId}/environments/${params.environmentId}/restart`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: environmentKeys.forProject(vars.projectId) })
      qc.invalidateQueries({ queryKey: projectKeys.all })
    },
  }))
}

export function useDeleteProjectEnvironment() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: { projectId: string; environmentId: string }) =>
      api.delete<{ ok: true }>(`/projects/${params.projectId}/environments/${params.environmentId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: environmentKeys.forProject(vars.projectId) })
      qc.invalidateQueries({ queryKey: projectKeys.all })
    },
  }))
}

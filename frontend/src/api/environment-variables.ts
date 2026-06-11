import { createMutation, useQueryClient } from "@tanstack/solid-query"
import { createAppQuery } from "~/lib/create-app-query"
import { api } from "./client"
import { projectKeys } from "./projects"

export interface EnvironmentVariableEntry {
  key: string
  value: string
}

export interface EnvironmentVariablesResponse {
  variables: EnvironmentVariableEntry[]
}

export type EnvironmentVariablesRestart = "app" | "pod" | "none"

export interface UpdateEnvironmentVariablesResult {
  ok: true
  restart: EnvironmentVariablesRestart
}

export const environmentVariablesKeys = {
  detail: (projectId: string, environmentId: string) =>
    [...projectKeys.detail(projectId), "environments", environmentId, "variables"] as const,
}

export function useEnvironmentVariables(
  projectId: () => string,
  environmentId: () => string,
  options?: { enabled?: () => boolean },
) {
  return createAppQuery(() => ({
    queryKey: environmentVariablesKeys.detail(projectId(), environmentId()),
    queryFn: () =>
      api.get<EnvironmentVariablesResponse>(
        `/projects/${projectId()}/environments/${environmentId()}/variables`,
      ),
    enabled: options?.enabled ? options.enabled() : true,
  }))
}

export function useUpdateEnvironmentVariables() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (params: {
      projectId: string
      environmentId: string
      variables: Record<string, string>
      restartApp: boolean
    }) =>
      api.put<UpdateEnvironmentVariablesResult>(
        `/projects/${params.projectId}/environments/${params.environmentId}/variables`,
        { variables: params.variables, restartApp: params.restartApp },
      ),
    onSuccess: (_result, vars) =>
      qc.invalidateQueries({
        queryKey: environmentVariablesKeys.detail(vars.projectId, vars.environmentId),
      }),
  }))
}

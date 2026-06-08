import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { api, type ProjectAuthResponse, type UpdateProjectAuthDto } from "~/api/client"
import { environmentKeys } from "~/api/environments"

export const projectAuthQueryKey = (projectId: string, environmentId: string) =>
  ["project", projectId, "environments", environmentId, "auth"] as const

export function useProjectAuth(projectId: () => string, environmentId: () => string) {
  const queryClient = useQueryClient()

  const authUrl = () => `/projects/${projectId()}/environments/${environmentId()}/auth`

  const query = createQuery(() => ({
    queryKey: projectAuthQueryKey(projectId(), environmentId()),
    queryFn: () => api.get<ProjectAuthResponse>(authUrl()),
    refetchOnWindowFocus: false,
  }))

  const mutation = createMutation(() => ({
    mutationFn: (dto: UpdateProjectAuthDto) => api.put<ProjectAuthResponse>(authUrl(), dto),
    onSuccess: (data) => {
      queryClient.setQueryData(projectAuthQueryKey(projectId(), environmentId()), data)
      queryClient.invalidateQueries({ queryKey: ["project", projectId()] })
      queryClient.invalidateQueries({ queryKey: environmentKeys.forProject(projectId()) })
    },
  }))

  return { query, mutation }
}

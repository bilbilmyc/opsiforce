import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query"
import { api, type ProjectAuthResponse, type UpdateProjectAuthDto } from "~/api/client"

export const projectAuthQueryKey = (projectId: string) => ["project", projectId, "auth"] as const

export function useProjectAuth(projectId: () => string) {
  const queryClient = useQueryClient()

  const query = createQuery(() => ({
    queryKey: projectAuthQueryKey(projectId()),
    queryFn: () => api.get<ProjectAuthResponse>(`/projects/${projectId()}/auth`),
    refetchOnWindowFocus: false,
  }))

  const mutation = createMutation(() => ({
    mutationFn: (dto: UpdateProjectAuthDto) =>
      api.put<ProjectAuthResponse>(`/projects/${projectId()}/auth`, dto),
    onSuccess: (data) => {
      queryClient.setQueryData(projectAuthQueryKey(projectId()), data)
      queryClient.invalidateQueries({ queryKey: ["project", projectId()] })
    },
  }))

  return { query, mutation }
}

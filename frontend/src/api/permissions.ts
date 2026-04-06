import { createQuery } from "@tanstack/solid-query"
import { api } from "./client"

export function usePermissions() {
  const query = createQuery(() => ({
    queryKey: ["permissions"],
    queryFn: () => api.get<string[]>("/permissions"),
    staleTime: Infinity,
  }))

  const hasPermission = (permission: string) =>
    query.data?.includes(permission) ?? false

  return { permissions: query, hasPermission }
}

import { createQuery } from "@tanstack/solid-query"
import { api, type Agent } from "./client"

export const agentKeys = {
  all: ["agents"] as const,
  list: () => [...agentKeys.all, "list"] as const,
}

export function useAgents() {
  return createQuery(() => ({
    queryKey: agentKeys.list(),
    queryFn: () => api.get<Agent[]>("/agents"),
    refetchOnWindowFocus: false,
  }))
}

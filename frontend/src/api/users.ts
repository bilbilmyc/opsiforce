import { createMutation, useQueryClient } from "@tanstack/solid-query"
import { createAppQuery } from "~/lib/create-app-query"
import { api, type User, type WorkspacePreferences } from "./client"

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
  workspacePreferences: () => [...userKeys.all, "me", "workspace-preferences"] as const,
}

/** List users. Admin-only (backend gates with can_manage_workspaces). */
export function useUsers(enabled: () => boolean) {
  return createAppQuery(() => ({
    queryKey: userKeys.list(),
    queryFn: () => api.get<User[]>("/users"),
    enabled: enabled(),
  }))
}

export function useWorkspacePreferences() {
  return createAppQuery(() => ({
    queryKey: userKeys.workspacePreferences(),
    queryFn: () => api.get<WorkspacePreferences>("/users/me/workspace-preferences"),
  }))
}

export function useUpdateWorkspacePreferences() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (dto: { workspaceOrder?: string[] }) =>
      api.patch<WorkspacePreferences>("/users/me/workspace-preferences", dto),
    onMutate: async (dto) => {
      // Optimistic — write new prefs into cache immediately.
      await qc.cancelQueries({ queryKey: userKeys.workspacePreferences() })
      const prev = qc.getQueryData<WorkspacePreferences>(userKeys.workspacePreferences())
      if (prev && dto.workspaceOrder) {
        qc.setQueryData<WorkspacePreferences>(userKeys.workspacePreferences(), {
          ...prev,
          workspaceOrder: dto.workspaceOrder,
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(userKeys.workspacePreferences(), ctx.prev)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: userKeys.workspacePreferences() })
      qc.invalidateQueries({ queryKey: ["workspaces"] })
    },
  }))
}

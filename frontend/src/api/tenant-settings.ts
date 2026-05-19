import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query"
import { api } from "./client"
import { projectKeys } from "./projects"

export interface TenantSettings {
  makaraTenantName: string | null
}

export interface UpdateTenantSettingsDto {
  makaraTenantName: string
}

export const tenantSettingsKeys = {
  all: ["tenant-settings"] as const,
}

export function useTenantSettings() {
  return createQuery(() => ({
    queryKey: tenantSettingsKeys.all,
    queryFn: () => api.get<TenantSettings>("/tenant-settings"),
  }))
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient()
  return createMutation(() => ({
    mutationFn: (dto: UpdateTenantSettingsDto) => api.put<TenantSettings>("/tenant-settings", dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantSettingsKeys.all })
      qc.invalidateQueries({ queryKey: projectKeys.all })
    },
  }))
}

import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { api, type TenantConfig } from './client';
import { createAppQuery } from '~/lib/create-app-query';
import { workspaceKeys } from './workspaces';

export const tenantConfigKey = ['tenant-config'] as const;

export function useTenantConfig() {
  return createAppQuery(() => ({
    queryKey: tenantConfigKey,
    queryFn: () => api.get<TenantConfig>('/tenants/config'),
  }));
}

export function useUpdateTenantConfig() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (dto: Partial<TenantConfig>) => api.patch<TenantConfig>('/tenants/config', dto),
    onSuccess: (data) => {
      qc.setQueryData(tenantConfigKey, data);
      qc.invalidateQueries({ queryKey: workspaceKeys.all });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  }));
}

import { api, type Tenant } from './client';
import { createAppQuery } from '~/lib/create-app-query';

export function useAccessibleTenants() {
  return createAppQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.get<Tenant[]>('/tenants'),
  }));
}

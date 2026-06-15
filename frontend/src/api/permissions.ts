import { api } from './client';
import { createAppQuery } from '~/lib/create-app-query';

export function usePermissions() {
  const query = createAppQuery(() => ({
    queryKey: ['permissions'],
    queryFn: () => api.get<string[]>('/permissions'),
  }));

  const hasPermission = (permission: string) => query.data?.includes(permission) ?? false;

  return { permissions: query, hasPermission };
}

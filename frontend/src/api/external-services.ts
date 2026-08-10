import { createAppQuery } from '~/lib/create-app-query';
import { api } from './client';

export const EXTERNAL_SERVICES_ADMIN_BASE = '/external-services/admin';

export interface ExternalServiceSummary {
  name: string;
  displayName: string;
}

export const externalServiceKeys = {
  all: ['external-services'] as const,
  services: () => [...externalServiceKeys.all, 'services'] as const,
};

export function useExternalServices(options?: { enabled?: () => boolean }) {
  return createAppQuery(() => ({
    queryKey: externalServiceKeys.services(),
    queryFn: () => api.get<ExternalServiceSummary[]>(`${EXTERNAL_SERVICES_ADMIN_BASE}/services`),
    enabled: options?.enabled ? options.enabled() : true,
    reconcile: 'name',
  }));
}

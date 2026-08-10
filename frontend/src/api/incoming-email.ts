import { createMutation, useQueryClient } from '@tanstack/solid-query';
import { createAppQuery } from '~/lib/create-app-query';
import { api } from './client';
import { EXTERNAL_SERVICES_ADMIN_BASE } from './external-services';

export interface IncomingEmailIdentity {
  address: string;
}

const BASE = `${EXTERNAL_SERVICES_ADMIN_BASE}/incoming-email`;

export const incomingEmailKeys = {
  all: ['incoming-email'] as const,
  address: (projectEnvironmentId: string) => [...incomingEmailKeys.all, 'address', projectEnvironmentId] as const,
};

export function useIncomingEmailAddress(projectEnvironmentId: () => string, enabled: () => boolean) {
  return createAppQuery(() => ({
    queryKey: incomingEmailKeys.address(projectEnvironmentId()),
    queryFn: () =>
      api.get<IncomingEmailIdentity>(`${BASE}/environments/${encodeURIComponent(projectEnvironmentId())}/address`),
    enabled: projectEnvironmentId() !== '' && enabled(),
    reconcile: false,
    retry: false,
  }));
}

export function useRegenerateIncomingEmailAddress() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: (projectEnvironmentId: string) =>
      api.post<IncomingEmailIdentity>(
        `${BASE}/environments/${encodeURIComponent(projectEnvironmentId)}/address/regenerate`
      ),
    onSuccess: (_data, projectEnvironmentId) =>
      qc.invalidateQueries({ queryKey: incomingEmailKeys.address(projectEnvironmentId) }),
  }));
}

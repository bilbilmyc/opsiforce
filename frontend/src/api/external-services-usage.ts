import { api } from './client';
import { createAppQuery } from '~/lib/create-app-query';

export interface UsageEnvironmentBreakdown {
  projectEnvironmentId: string | null;
  environmentName: string | null;
  isDefault: boolean;
  deleted: boolean;
  count: number;
}

export interface UsageProjectBreakdown {
  projectId: string | null;
  projectTitle: string | null;
  deleted: boolean;
  count: number;
  environments: UsageEnvironmentBreakdown[];
}

export interface UsageServiceBreakdown {
  service: string;
  displayName: string;
  count: number;
  projects: UsageProjectBreakdown[];
}

export interface UsageOrganization {
  tenantId: string;
  tenantName: string;
  tenantDisplayName: string;
  count: number;
  services: UsageServiceBreakdown[];
}

export interface UsageView {
  month: string;
  organizations: UsageOrganization[];
}

export function useExternalServicesUsage(month: () => string) {
  return createAppQuery(() => ({
    queryKey: ['external-services-usage', month()],
    queryFn: () => api.get<UsageView>(`/external-services/admin/usage?month=${month()}`),
    reconcile: false,
  }));
}

export interface UsageBucketKey {
  tenantId: string;
  projectId: string;
  projectEnvironmentId: string;
  service: string;
}

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

export interface UsageView {
  month: string;
  services: UsageServiceBreakdown[];
}

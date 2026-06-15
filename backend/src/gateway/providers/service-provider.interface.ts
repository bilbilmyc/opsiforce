export interface ServiceProviderContext {
  projectId: string;
  tenantId: string;
}

export interface ServiceProviderResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ServiceProvider {
  readonly serviceName: string;
  execute(payload: unknown, context: ServiceProviderContext): Promise<ServiceProviderResult>;
}

export const SERVICE_PROVIDERS = Symbol('SERVICE_PROVIDERS');

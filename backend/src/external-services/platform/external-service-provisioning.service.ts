import { Injectable, Logger } from '@nestjs/common';
import { ExternalServiceRegistry } from './external-service-registry';

@Injectable()
export class ExternalServiceProvisioningService {
  private readonly logger = new Logger(ExternalServiceProvisioningService.name);

  constructor(private readonly registry: ExternalServiceRegistry) {}

  async provisionEnvironment(projectEnvironmentId: string): Promise<void> {
    for (const definition of this.registry.list()) {
      if (!definition.provisionEnvironment) continue;
      try {
        await definition.provisionEnvironment(projectEnvironmentId);
      } catch (err) {
        this.logger.warn(
          `Provisioning ${definition.serviceName} for environment ${projectEnvironmentId} failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}

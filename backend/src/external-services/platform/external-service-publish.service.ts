import { Injectable, Logger } from '@nestjs/common';
import { errorMessage } from '../../common/error-message';
import { ExternalServiceRegistry } from './external-service-registry';

@Injectable()
export class ExternalServicePublishService {
  private readonly logger = new Logger(ExternalServicePublishService.name);

  constructor(private readonly registry: ExternalServiceRegistry) {}

  async carryInboundWiring(sourceEnvironmentId: string, targetEnvironmentId: string): Promise<void> {
    if (sourceEnvironmentId === targetEnvironmentId) return;

    const failedServices: string[] = [];

    for (const definition of this.registry.list()) {
      if (!definition.carryOnPublish) continue;
      try {
        await definition.carryOnPublish({ sourceEnvironmentId, targetEnvironmentId });
      } catch (err) {
        this.logger.warn(
          `Carrying ${definition.serviceName} wiring from ${sourceEnvironmentId} to ${targetEnvironmentId} failed: ${errorMessage(err)}`
        );
        failedServices.push(definition.serviceName);
      }
    }

    if (failedServices.length > 0) {
      throw new Error(`Carrying external-service wiring failed for ${failedServices.join(', ')}`);
    }
  }
}

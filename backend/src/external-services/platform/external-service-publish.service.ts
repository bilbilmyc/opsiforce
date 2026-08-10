import { Injectable, Logger } from '@nestjs/common';
import { ExternalServiceRegistry } from './external-service-registry';

@Injectable()
export class ExternalServicePublishService {
  private readonly logger = new Logger(ExternalServicePublishService.name);

  constructor(private readonly registry: ExternalServiceRegistry) {}

  async carryInboundWiring(sourceEnvironmentId: string, targetEnvironmentId: string): Promise<void> {
    if (sourceEnvironmentId === targetEnvironmentId) return;

    for (const definition of this.registry.list()) {
      if (!definition.carryOnPublish) continue;
      try {
        await definition.carryOnPublish({ sourceEnvironmentId, targetEnvironmentId });
      } catch (err) {
        this.logger.warn(
          `Carrying ${definition.serviceName} wiring from ${sourceEnvironmentId} to ${targetEnvironmentId} failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}

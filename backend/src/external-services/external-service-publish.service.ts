import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { projectApps } from '../../db/schema';
import { ExternalServiceRegistry } from './external-service-registry';

@Injectable()
export class ExternalServicePublishService {
  private readonly logger = new Logger(ExternalServicePublishService.name);

  constructor(private readonly registry: ExternalServiceRegistry) {}

  async carryInboundWiring(sourceEnvironmentId: string, targetEnvironmentId: string): Promise<void> {
    if (sourceEnvironmentId === targetEnvironmentId) return;

    const declaredServices = await this.carryAppDeclaration(sourceEnvironmentId, targetEnvironmentId);

    for (const definition of this.registry.list()) {
      if (!definition.carryOnPublish) continue;
      try {
        await definition.carryOnPublish({ sourceEnvironmentId, targetEnvironmentId, declaredServices });
      } catch (err) {
        this.logger.warn(
          `Carrying ${definition.serviceName} wiring from ${sourceEnvironmentId} to ${targetEnvironmentId} failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private async carryAppDeclaration(sourceEnvironmentId: string, targetEnvironmentId: string): Promise<string[]> {
    const [source] = await db
      .select({
        projectId: projectApps.projectId,
        name: projectApps.name,
        description: projectApps.description,
        externalServices: projectApps.externalServices,
      })
      .from(projectApps)
      .where(eq(projectApps.projectEnvironmentId, sourceEnvironmentId));

    if (!source) return [];

    await db
      .insert(projectApps)
      .values({
        projectEnvironmentId: targetEnvironmentId,
        projectId: source.projectId,
        name: source.name,
        description: source.description,
        externalServices: source.externalServices,
      })
      .onConflictDoUpdate({
        target: projectApps.projectEnvironmentId,
        set: { externalServices: source.externalServices, updatedAt: new Date() },
      });

    return source.externalServices;
  }
}

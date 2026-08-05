import { Injectable, Logger, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import path from 'path';
import { db } from '../../db';
import { projectEnvironments, projects } from '../../db/schema';
import type { ExternalServiceDefinition, ExternalServiceRow, WebhookRequest } from './external-service-definition';
import { ExternalServiceRegistry } from './external-service-registry';
import { ExternalServiceStore } from './external-service-store.service';
import { ExternalServiceUsageService } from './external-service-usage.service';

export interface StoredMessages {
  service: string;
  projectEnvironmentId: string;
  envDirectory: string;
  rowIds: number[];
}

interface IngestTarget {
  directory: string;
  projectId: string;
  tenantId: string | null;
}

@Injectable()
export class WebhookIngestService {
  private readonly logger = new Logger(WebhookIngestService.name);
  private readonly storageMountPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: ExternalServiceRegistry,
    private readonly store: ExternalServiceStore,
    private readonly usage: ExternalServiceUsageService
  ) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
  }

  async ingest(serviceName: string, request: WebhookRequest): Promise<StoredMessages[]> {
    const definition = this.registry.get(serviceName);
    if (!definition) throw new NotFoundException(`Unknown external service: ${serviceName}`);

    const verification = await definition.verify(request);
    if (!verification.verified) {
      this.logger.warn(`Rejected ${serviceName} webhook: ${verification.reason}`);
      throw new NotAcceptableException(verification.reason);
    }

    const routingKeys = definition.extractRoutingKeys(request);
    const stored: StoredMessages[] = [];
    let destinations = 0;

    for (const routingKey of routingKeys) {
      const projectEnvironmentIds = await definition.resolveEnvironments(routingKey, request);
      if (projectEnvironmentIds.length === 0) continue;

      const rows = await definition.buildRows(request, routingKey);

      for (const projectEnvironmentId of projectEnvironmentIds) {
        destinations++;
        const written = await this.storeForEnvironment(definition, projectEnvironmentId, rows, routingKey);
        if (written && written.rowIds.length > 0) {
          stored.push({ service: serviceName, projectEnvironmentId, ...written });
        }
      }
    }

    if (destinations === 0) this.rejectUnrouted(definition, routingKeys);

    return stored;
  }

  private async storeForEnvironment(
    definition: ExternalServiceDefinition,
    projectEnvironmentId: string,
    rows: ExternalServiceRow[],
    routingKey: string
  ): Promise<{ envDirectory: string; rowIds: number[] } | null> {
    const target = await this.ingestTarget(projectEnvironmentId);
    if (!target) {
      this.logger.warn(`Environment ${projectEnvironmentId} has no storage directory, dropping ${routingKey}`);
      return null;
    }

    const envDirectory = path.join(this.storageMountPath, target.directory);
    const rowIds = await this.store.store(envDirectory, definition, rows);

    this.logger.log(
      `Stored ${rowIds.length}/${rows.length} ${definition.serviceName} message(s) for environment ${projectEnvironmentId}`
    );

    await this.meterStored(definition, projectEnvironmentId, target, rowIds.length);
    return { envDirectory, rowIds };
  }

  private async meterStored(
    definition: ExternalServiceDefinition,
    projectEnvironmentId: string,
    target: IngestTarget,
    storedMessages: number
  ): Promise<void> {
    if (storedMessages < 1) return;
    if (!target.tenantId) {
      this.logger.error(
        `Cannot meter ${storedMessages} ${definition.serviceName} message(s) for environment ${projectEnvironmentId}: project ${target.projectId} has no tenant`
      );
      return;
    }

    try {
      await this.usage.recordStoredMessages(
        {
          tenantId: target.tenantId,
          projectId: target.projectId,
          projectEnvironmentId,
          service: definition.serviceName,
        },
        storedMessages
      );
    } catch (err) {
      this.logger.error(
        `Usage metering failed for ${storedMessages} stored ${definition.serviceName} message(s) in environment ${projectEnvironmentId}; the message is stored and acknowledged, the counter will undercount`,
        err instanceof Error ? err.stack : String(err)
      );
    }
  }

  private rejectUnrouted(definition: ExternalServiceDefinition, routingKeys: string[]): void {
    if (definition.unroutableResponse === 'accept') return;
    throw new NotAcceptableException(
      `No ${definition.serviceName} destination for ${routingKeys.join(', ') || 'the request'}`
    );
  }

  private async ingestTarget(projectEnvironmentId: string): Promise<IngestTarget | null> {
    const [row] = await db
      .select({
        directory: projectEnvironments.directory,
        projectId: projectEnvironments.projectId,
        tenantId: projects.tenantId,
      })
      .from(projectEnvironments)
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .where(eq(projectEnvironments.id, projectEnvironmentId));

    return row ?? null;
  }
}

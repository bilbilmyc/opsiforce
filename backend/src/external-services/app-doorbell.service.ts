import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { projectApps, projectEnvironments } from '../../db/schema';
import type { ExternalServiceDefinition } from './external-service-definition';
import { ExternalServiceRegistry } from './external-service-registry';
import { ExternalServiceStore } from './external-service-store.service';
import type { StoredMessages } from './webhook-ingest.service';

const CALLBACK_TIMEOUT_MS = 10_000;

@Injectable()
export class AppDoorbellService {
  private readonly logger = new Logger(AppDoorbellService.name);
  private readonly appPort: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly registry: ExternalServiceRegistry,
    private readonly store: ExternalServiceStore
  ) {
    this.appPort = this.configService.getOrThrow<number>('appPort');
  }

  dispatchAfterAck(stored: StoredMessages[]): void {
    if (stored.length === 0) return;
    setImmediate(() => {
      void this.dispatchAll(stored);
    });
  }

  private async dispatchAll(stored: StoredMessages[]): Promise<void> {
    for (const entry of stored) {
      const definition = this.registry.get(entry.service);
      if (!definition) continue;

      try {
        await this.ring(definition, entry);
      } catch (err) {
        this.logger.warn(
          `${definition.serviceName} callback to environment ${entry.projectEnvironmentId} failed, ${entry.rowIds.length} row(s) stay undelivered: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private async ring(definition: ExternalServiceDefinition, entry: StoredMessages): Promise<void> {
    const target = await this.callbackTarget(entry.projectEnvironmentId);
    if (!target) return;

    if (!target.externalServices.includes(definition.serviceName)) {
      this.logger.log(
        `Environment ${entry.projectEnvironmentId} does not declare ${definition.serviceName}, skipping callback`
      );
      return;
    }

    if (!target.podIp) {
      this.logger.log(
        `Environment ${entry.projectEnvironmentId} has no running pod, skipping ${definition.serviceName} callback`
      );
      return;
    }

    const url = `http://${target.podIp}:${this.appPort}${definition.callbackPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: definition.serviceName, rowIds: entry.rowIds }),
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });

    if (!response.ok) {
      this.logger.warn(
        `${definition.serviceName} callback to environment ${entry.projectEnvironmentId} returned ${response.status}, ${entry.rowIds.length} row(s) stay undelivered`
      );
      return;
    }

    await this.store.markDelivered(entry.envDirectory, definition, entry.rowIds);
    this.logger.log(
      `Delivered ${entry.rowIds.length} ${definition.serviceName} row(s) to environment ${entry.projectEnvironmentId}`
    );
  }

  private async callbackTarget(
    projectEnvironmentId: string
  ): Promise<{ externalServices: string[]; podIp: string | null } | null> {
    const [row] = await db
      .select({
        externalServices: projectApps.externalServices,
        podIp: projectEnvironments.podIp,
      })
      .from(projectEnvironments)
      .innerJoin(projectApps, eq(projectApps.projectEnvironmentId, projectEnvironments.id))
      .where(eq(projectEnvironments.id, projectEnvironmentId));

    return row ?? null;
  }
}

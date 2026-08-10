import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { db } from '../../../db';
import { projectEnvironments } from '../../../db/schema';
import { ExternalServiceStore } from './external-service-store.service';
import type { StoredMessages } from './webhook-ingest.service';

const CALLBACK_TIMEOUT_MS = 10_000;

@Injectable()
export class AppDoorbellService {
  private readonly logger = new Logger(AppDoorbellService.name);
  private readonly appPort: number;

  constructor(
    private readonly configService: ConfigService,
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
      try {
        await this.ring(entry);
      } catch (err) {
        this.logger.warn(
          `${entry.service} callback to environment ${entry.projectEnvironmentId} failed, ${entry.rowIds.length} row(s) stay undelivered: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private async ring(entry: StoredMessages): Promise<void> {
    const podIp = await this.podIp(entry.projectEnvironmentId);
    if (!podIp) {
      this.logger.log(
        `Environment ${entry.projectEnvironmentId} has no running pod, skipping ${entry.service} callback`
      );
      return;
    }

    const url = `http://${podIp}:${this.appPort}/api/external-services/${entry.service}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: entry.service, rowIds: entry.rowIds }),
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });

    if (!response.ok) {
      this.logger.warn(
        `${entry.service} callback to environment ${entry.projectEnvironmentId} returned ${response.status}, ${entry.rowIds.length} row(s) stay undelivered`
      );
      return;
    }

    await this.store.markDelivered(entry.envDirectory, entry.rowIds);
    this.logger.log(
      `Delivered ${entry.rowIds.length} ${entry.service} row(s) to environment ${entry.projectEnvironmentId}`
    );
  }

  private async podIp(projectEnvironmentId: string): Promise<string | null> {
    const [row] = await db
      .select({ podIp: projectEnvironments.podIp })
      .from(projectEnvironments)
      .where(eq(projectEnvironments.id, projectEnvironmentId));

    return row?.podIp ?? null;
  }
}

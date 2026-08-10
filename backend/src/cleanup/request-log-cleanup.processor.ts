import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { access } from 'fs/promises';
import path from 'path';
import type { Database } from 'sqlite';
import { db } from '../../db';
import { projectEnvironments } from '../../db/schema';
import {
  environmentDatabasePath,
  openEnvironmentDatabase,
  type SqlitePragmaProfile,
} from '../common/environment-database';

export const REQUEST_LOG_CLEANUP_QUEUE = 'request-log-cleanup';
type LogTable = 'app_requests' | 'process_logs' | 'process_events';

const REQUEST_LOG_DATABASE_FILE = 'database.db';
const REQUEST_LOG_PRAGMAS: SqlitePragmaProfile = { busyTimeoutMs: 5000 };

@Processor(REQUEST_LOG_CLEANUP_QUEUE)
export class RequestLogCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(RequestLogCleanupProcessor.name);
  private readonly storageMountPath: string;
  private readonly retentionDays: number;

  constructor(private readonly configService: ConfigService) {
    super();
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
    this.retentionDays = this.configService.getOrThrow<number>('requestLogRetentionDays');
  }

  async process(_job: Job): Promise<void> {
    const startedAt = Date.now();
    const rows = await db
      .select({ id: projectEnvironments.id, directory: projectEnvironments.directory })
      .from(projectEnvironments);

    let scanned = 0;
    let skipped = 0;
    let totalDeleted = 0;

    for (const row of rows) {
      const envDirectory = path.join(this.storageMountPath, row.directory);
      const dbPath = environmentDatabasePath(envDirectory, REQUEST_LOG_DATABASE_FILE);

      const exists = await access(dbPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        skipped++;
        continue;
      }

      try {
        totalDeleted += await this.cleanupDatabase(envDirectory);
        scanned++;
      } catch (err) {
        this.logger.warn(
          `Failed to clean request log for environment ${row.id} at ${dbPath}: ${(err as Error).message}`
        );
      }
    }

    this.logger.log(
      `Request log cleanup finished: scanned=${scanned} skipped=${skipped} deleted=${totalDeleted} retentionDays=${this.retentionDays} durationMs=${Date.now() - startedAt}`
    );
  }

  private async cleanupDatabase(envDirectory: string): Promise<number> {
    const connection = await openEnvironmentDatabase(envDirectory, REQUEST_LOG_DATABASE_FILE, REQUEST_LOG_PRAGMAS);
    try {
      let deleted = 0;
      deleted += await this.cleanupTable(connection, 'app_requests');
      deleted += await this.cleanupTable(connection, 'process_logs');
      deleted += await this.cleanupTable(connection, 'process_events');
      return deleted;
    } finally {
      await connection.close().catch(() => {});
    }
  }

  private async cleanupTable(connection: Database, table: LogTable): Promise<number> {
    const row = await connection.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = ?",
      table
    );
    if (!row || row.count === 0) return 0;
    const result = await connection.run(
      `DELETE FROM ${table} WHERE created_at < datetime('now', ?)`,
      `-${this.retentionDays} days`
    );
    return result.changes ?? 0;
  }
}

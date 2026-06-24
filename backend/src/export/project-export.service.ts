import { ConflictException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, desc, eq, inArray, lte } from 'drizzle-orm';
import crypto from 'crypto';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { db } from '../../db';
import { projectTransferJobs } from '../../db/schema';
import { ProjectEventsService } from '../project/project-events.service';
import {
  ACTIVE_EXPORT_STATUSES,
  PROJECT_EXPORT_QUEUE,
  ProjectExportJobData,
  ProjectExportJobResponse,
  ProjectExportStatus,
} from './project-export.types';

@Injectable()
export class ProjectExportService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectExportService.name);
  private readonly storageMountPath: string;
  private readonly retentionMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly projectEventsService: ProjectEventsService,
    @InjectQueue(PROJECT_EXPORT_QUEUE)
    private readonly queue: Queue<ProjectExportJobData>
  ) {
    this.storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
    this.retentionMs = this.configService.getOrThrow<number>('exportRetentionMinutes') * 60_000;
  }

  async onApplicationBootstrap(): Promise<void> {
    const stranded = await db
      .update(projectTransferJobs)
      .set({
        status: ProjectExportStatus.Failed,
        error: 'Export interrupted by a server restart',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(projectTransferJobs.kind, 'export'), inArray(projectTransferJobs.status, ACTIVE_EXPORT_STATUSES)))
      .returning({ id: projectTransferJobs.id });

    for (const job of stranded) {
      await rm(this.stagingPath(job.id), { recursive: true, force: true }).catch(() => {});
      await rm(this.artifactPath(job.id), { force: true }).catch(() => {});
    }
    if (stranded.length > 0) {
      this.logger.warn(`Marked ${stranded.length} interrupted export job(s) as failed on startup`);
    }
  }

  exportsDir(): string {
    return path.join(this.storageMountPath, 'exports');
  }

  artifactPath(exportJobId: string): string {
    return path.join(this.exportsDir(), `${exportJobId}.zip`);
  }

  stagingPath(exportJobId: string): string {
    return path.join(this.exportsDir(), `.${exportJobId}.staging`);
  }

  async startExport(projectId: string, tenantId: string): Promise<ProjectExportJobResponse> {
    if (await this.hasActiveExport(projectId)) {
      throw new ConflictException('An export is already in progress for this project');
    }

    const exportJobId = crypto.randomUUID();
    try {
      await db.insert(projectTransferJobs).values({
        id: exportJobId,
        kind: 'export',
        projectId,
        tenantId,
        status: ProjectExportStatus.Queued,
      });
    } catch (err) {
      if (isActiveExportConflict(err)) {
        throw new ConflictException('An export is already in progress for this project');
      }
      throw err;
    }

    try {
      await this.enqueueExportJob({ exportJobId, projectId, tenantId });
    } catch (err) {
      await this.abandonJob(exportJobId);
      throw err;
    }

    await this.projectEventsService.publish(projectId);
    return this.getJob(exportJobId);
  }

  async getLatestJob(projectId: string): Promise<ProjectExportJobResponse | null> {
    const [row] = await db
      .select()
      .from(projectTransferJobs)
      .where(and(eq(projectTransferJobs.kind, 'export'), eq(projectTransferJobs.projectId, projectId)))
      .orderBy(desc(projectTransferJobs.createdAt))
      .limit(1);
    return row ? toResponse(row) : null;
  }

  async getJob(exportJobId: string): Promise<ProjectExportJobResponse> {
    const [row] = await db.select().from(projectTransferJobs).where(eq(projectTransferJobs.id, exportJobId));
    if (!row) throw new NotFoundException(`Export job ${exportJobId} not found`);
    return toResponse(row);
  }

  async findCompletedArtifact(
    projectId: string,
    exportJobId: string
  ): Promise<{ filePath: string; fileName: string; fileSize: number | null }> {
    const [row] = await db
      .select()
      .from(projectTransferJobs)
      .where(
        and(
          eq(projectTransferJobs.kind, 'export'),
          eq(projectTransferJobs.id, exportJobId),
          eq(projectTransferJobs.projectId, projectId)
        )
      );
    if (!row || row.status !== ProjectExportStatus.Completed) {
      throw new NotFoundException('Export file not found');
    }
    return {
      filePath: this.artifactPath(row.id),
      fileName: row.fileName ?? `${row.id}.zip`,
      fileSize: row.fileSize,
    };
  }

  async purgeJob(exportJobId: string): Promise<void> {
    await rm(this.artifactPath(exportJobId), { force: true }).catch(() => {});
    await db.delete(projectTransferJobs).where(eq(projectTransferJobs.id, exportJobId));
  }

  async sweepExpiredArtifacts(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionMs);
    const rows = await db
      .select({ id: projectTransferJobs.id })
      .from(projectTransferJobs)
      .where(
        and(
          eq(projectTransferJobs.kind, 'export'),
          inArray(projectTransferJobs.status, [ProjectExportStatus.Completed, ProjectExportStatus.Failed]),
          lte(projectTransferJobs.completedAt, cutoff)
        )
      );
    for (const row of rows) {
      await this.purgeJob(row.id);
    }
    return rows.length;
  }

  private async hasActiveExport(projectId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: projectTransferJobs.id })
      .from(projectTransferJobs)
      .where(
        and(
          eq(projectTransferJobs.kind, 'export'),
          eq(projectTransferJobs.projectId, projectId),
          inArray(projectTransferJobs.status, ACTIVE_EXPORT_STATUSES)
        )
      )
      .limit(1);
    return !!row;
  }

  private async enqueueExportJob(data: ProjectExportJobData): Promise<void> {
    await this.queue.add('export', data, {
      jobId: data.exportJobId,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: 1000,
    });
  }

  private async abandonJob(exportJobId: string): Promise<void> {
    await db
      .update(projectTransferJobs)
      .set({
        status: ProjectExportStatus.Failed,
        error: 'Failed to enqueue export job',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectTransferJobs.id, exportJobId))
      .catch((err) => {
        this.logger.warn(`Failed to abandon export job ${exportJobId}: ${(err as Error).message}`);
      });
  }
}

interface PostgresErrorFields {
  code?: string;
  constraint_name?: string;
}

function isActiveExportConflict(err: unknown): boolean {
  const direct = err as PostgresErrorFields & { cause?: unknown };
  const pg = direct?.code ? direct : ((direct?.cause as PostgresErrorFields | undefined) ?? {});
  return pg.code === '23505' && pg.constraint_name === 'uq_project_transfer_jobs_one_active';
}

function toResponse(row: typeof projectTransferJobs.$inferSelect): ProjectExportJobResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as ProjectExportStatus,
    bytesTotal: row.bytesTotal,
    bytesProcessed: row.bytesProcessed,
    fileName: row.fileName,
    fileSize: row.fileSize,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

import { Controller, Post, Param, Req, Res, Logger } from '@nestjs/common';
import type { MultipartFile } from '@fastify/multipart';
import { FastifyRequest, FastifyReply } from 'fastify';
import { UploadService } from './upload.service';
import { SingleQuery } from './single-query.decorator';
import { WorkspaceAccessService } from './workspace-access.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';

interface MultipartRequest extends FastifyRequest {
  parts(): AsyncIterableIterator<MultipartFile | { type: 'field' }>;
}

type UploadEvent = Record<string, string | number | boolean | undefined>;

@Controller('projects')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly uploadService: UploadService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  @Post(':projectId/upload')
  async upload(
    @Param('projectId') projectId: string,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @SingleQuery('targetPath') targetPath: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: MultipartRequest,
    @Res() reply: FastifyReply
  ) {
    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    const targetDirectory = await this.uploadService.resolveUploadTargetDirectory(directory, targetPath);

    this.workspaceAccessService.touchActivity(projectId, environmentId);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const emit = (event: UploadEvent) => {
      reply.raw.write(JSON.stringify(event) + '\n');
    };
    const summaryEvents = req.headers['x-upload-events'] === 'summary';

    let uploaded = 0;
    let failed = 0;
    const PROGRESS_INTERVAL_MS = 250;

    try {
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;

        const relativePath = part.fieldname;

        try {
          const destPath = this.uploadService.resolveUploadPath(targetDirectory, relativePath);
          let lastProgressAt = 0;
          const onProgress = (bytes: number) => {
            const now = Date.now();
            if (lastProgressAt !== 0 && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
            lastProgressAt = now;
            if (!summaryEvents) emit({ type: 'progress', path: relativePath, bytes });
          };
          const { size } = await this.uploadService.streamFileToDisk(destPath, part.file, onProgress);

          uploaded += 1;
          if (!summaryEvents) emit({ type: 'file', path: relativePath, size, ok: true });
        } catch (err) {
          drainPart(part);
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Upload failed for ${relativePath}: ${message}`);
          failed += 1;
          emit({
            type: 'file',
            path: relativePath,
            size: 0,
            ok: false,
            error: message,
          });
        }
      }

      emit({ type: 'done', uploaded, failed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Upload stream aborted: ${message}`);
      emit({ type: 'error', error: message, uploaded, failed });
    } finally {
      reply.raw.end();
    }
  }
}

function drainPart(part: MultipartFile) {
  const stream = part.file;
  if (stream.destroyed) return;
  stream.on('error', () => {});
  stream.resume();
}

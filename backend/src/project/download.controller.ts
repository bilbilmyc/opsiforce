import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { open } from 'fs/promises';
import { basename } from 'path';
import { DownloadService } from './download.service';
import { ProjectService } from './project.service';
import { ProjectEnvironmentService } from '../project-environment/project-environment.service';
import { UserService } from '../user/user.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';

@Controller('projects')
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  constructor(
    private readonly downloadService: DownloadService,
    private readonly projectService: ProjectService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly userService: UserService
  ) {}

  @Get(':projectId/files/download')
  async download(
    @Param('projectId') projectId: string,
    @Query('path') requestedPath: string | undefined,
    @Query('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    if (!requestedPath) throw new BadRequestException('Missing file path');

    const dbUser = await this.userService.getOrCreateUser(
      { keycloakId: user.userId, email: user.email ?? undefined, displayName: user.displayName ?? undefined },
      tenant.tenantId
    );
    const project = await this.projectService.findOneForUser({
      projectId,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
    });

    let directory = project.directory;
    if (environmentId && environmentId !== projectId) {
      const env = await this.projectEnvironmentService.findById(environmentId);
      if (env.projectId !== projectId) throw new NotFoundException(`Environment ${environmentId} not found`);
      directory = env.directory;
    }

    const filePath = this.downloadService.resolveWorkspacePath(directory, requestedPath);

    const handle = await open(filePath, 'r').catch(() => null);
    if (!handle) throw new NotFoundException('File not found');

    const info = await handle.stat().catch(() => null);
    if (!info || !info.isFile() || !(await this.downloadService.isOpenedFileWithinWorkspace(directory, handle.fd))) {
      await handle.close().catch(() => {});
      throw new NotFoundException('File not found');
    }

    this.projectService.touchActivity(environmentId ?? projectId).catch(() => {});

    const filename = basename(filePath);
    const headers = {
      'Content-Type': this.downloadService.contentType(filename),
      'Content-Length': info.size,
      'Content-Disposition': contentDisposition(filename),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    reply.hijack();
    reply.raw.writeHead(200, headers);

    const stream = handle.createReadStream();
    const abort = () => stream.destroy();
    req.raw.on('close', abort);
    stream.on('error', (err: Error) => {
      this.logger.error(`Download failed for ${filename}: ${err.message}`);
      req.raw.off('close', abort);
      reply.raw.destroy();
    });
    stream.on('end', () => req.raw.off('close', abort));
    stream.on('close', () => {
      handle.close().catch(() => {});
    });
    stream.pipe(reply.raw);
  }
}

function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

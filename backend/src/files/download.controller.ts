import { BadRequestException, Controller, Get, Logger, Param, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { contentDisposition, resolveContentType } from './file-content-types';
import { SingleQuery } from './single-query.decorator';
import { streamWorkspaceFile } from './file-stream';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceFileService } from './workspace-file.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';

@Controller('projects')
export class DownloadController {
  private readonly logger = new Logger(DownloadController.name);

  constructor(
    private readonly workspaceFileService: WorkspaceFileService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  @Get(':projectId/files/download')
  async download(
    @Param('projectId') projectId: string,
    @SingleQuery('path') requestedPath: string | undefined,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    if (!requestedPath) throw new BadRequestException('Missing file path');

    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    const file = await this.workspaceFileService.openForRead(directory, requestedPath);

    this.workspaceAccessService.touchActivity(projectId, environmentId);

    streamWorkspaceFile({
      req,
      reply,
      handle: file.handle,
      name: file.name,
      status: 200,
      headers: {
        'Content-Type': resolveContentType(file.name),
        'Content-Length': file.size,
        'Content-Disposition': contentDisposition(file.name, 'attachment'),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      logger: this.logger,
    });
  }
}

import { BadRequestException, Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { contentDisposition } from './file-content-types';
import { SingleQuery } from './single-query.decorator';
import { FileConversionService } from './file-conversion.service';
import type { ConversionJobResponse, ConversionStatusResponse, StartConversionDto } from './file-conversion.types';
import { WorkspaceAccessService } from './workspace-access.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';

@Controller('projects')
export class ConvertController {
  constructor(
    private readonly fileConversionService: FileConversionService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  @Post(':projectId/files/convert')
  async start(
    @Param('projectId') projectId: string,
    @Body() dto: StartConversionDto | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ): Promise<ConversionJobResponse> {
    const requestedPath = dto?.path;
    if (typeof requestedPath !== 'string' || !requestedPath) throw new BadRequestException('Missing file path');

    const environmentId = dto?.environmentId;
    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    const jobId = await this.fileConversionService.start(projectId, directory, requestedPath);

    this.workspaceAccessService.touchActivity(projectId, environmentId);
    return { jobId };
  }

  @Get(':projectId/files/convert/:jobId')
  async status(
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ): Promise<ConversionStatusResponse> {
    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    return this.fileConversionService.status(projectId, directory, jobId);
  }

  @Get(':projectId/files/convert/:jobId/result')
  async result(
    @Param('projectId') projectId: string,
    @Param('jobId') jobId: string,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    const { name, pdf } = this.fileConversionService.result(projectId, directory, jobId);

    await reply
      .status(200)
      .headers({
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(name, 'inline'),
        'Content-Length': pdf.byteLength,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(pdf);
  }
}

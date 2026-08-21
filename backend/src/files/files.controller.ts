import { Controller, Delete, Get, Param } from '@nestjs/common';
import { FilesService } from './files.service';
import { SingleQuery } from './single-query.decorator';
import { WorkspaceAccessService } from './workspace-access.service';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';
import type { FilesListing } from './files.types';

@Controller('projects')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly workspaceAccessService: WorkspaceAccessService
  ) {}

  @Get(':projectId/files')
  async list(
    @Param('projectId') projectId: string,
    @SingleQuery('path') requestedPath: string | undefined,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ): Promise<FilesListing> {
    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    return this.filesService.list(directory, requestedPath);
  }

  @Delete(':projectId/files')
  async remove(
    @Param('projectId') projectId: string,
    @SingleQuery('path') requestedPath: string | undefined,
    @SingleQuery('environmentId') environmentId: string | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ): Promise<void> {
    const directory = await this.workspaceAccessService.resolveDirectory(projectId, environmentId, tenant, user);
    await this.filesService.remove(directory, requestedPath);
    this.workspaceAccessService.touchActivity(projectId, environmentId);
  }
}

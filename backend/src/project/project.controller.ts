import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Res,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ProjectService } from './project.service';
import {
  CreateProjectDto,
  UpdateProjectDto,
  DuplicateProjectDto,
  UpdateProjectAuthDto,
  UpdateProjectLoggingDto,
  SetAppPinDto,
  SetEnvironmentSessionDto,
  UpdateAppDto,
  UpdateProjectPodClassDto,
} from './project.types';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import { CurrentUser, type UserContext } from '../user/user.decorator';
import { UserService } from '../user/user.service';
import { RequirePermission } from '../permission/permission.guard';
import { Perms } from '../permission/permission.constants';
import { ProjectEventsService } from './project-events.service';
import { EnvironmentVariablesService } from '../project-environment/environment-variables.service';
import type { UpdateEnvironmentVariablesDto } from '../project-environment/environment-variables.types';

@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
    private readonly projectEventsService: ProjectEventsService,
    private readonly environmentVariablesService: EnvironmentVariablesService
  ) {}

  /**
   * Create an unassigned project. Admin-only because unassigned projects are
   * invisible to non-admins. Workspace-scoped creation uses
   * POST /workspaces/:id/projects.
   */
  @Post()
  @RequirePermission(Perms.manageWorkspaces)
  create(@Body() dto: CreateProjectDto | undefined, @CurrentTenant() tenant: TenantContext) {
    return this.projectService.create(dto, tenant.tenantId);
  }

  @Get()
  async findAll(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId);
    return this.projectService.findAllForUser({
      tenantId: tenant.tenantId,
      userId: dbUserId,
    });
  }

  @Get(':id/events')
  async streamStatus(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply
  ) {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId);
    const loadStatus = () =>
      this.projectService.getState({
        projectId: id,
        tenantId: tenant.tenantId,
        userId: dbUserId,
      });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'x-no-compression': '1',
    });

    let closed = false;
    let unsubscribe = () => {};
    const heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(': ping\n\n');
    }, 25000);
    const close = () => {
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
    };

    const sendError = (code: 'not_found' | 'forbidden' | 'internal', message: string) => {
      if (closed) return;
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`);
      reply.raw.end();
      close();
    };

    const send = async () => {
      if (closed) return;
      try {
        const status = await loadStatus();
        if (closed) return;
        reply.raw.write(`data: ${JSON.stringify(status)}\n\n`);
      } catch (err) {
        if (err instanceof NotFoundException) sendError('not_found', err.message);
        else if (err instanceof ForbiddenException) sendError('forbidden', err.message);
        else sendError('internal', err instanceof Error ? err.message : 'Internal error');
      }
    };

    unsubscribe = this.projectEventsService.subscribe(id, () => {
      void send();
    });

    req.raw.on('close', close);
    await send();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId);
    return this.projectService.findOneForUser({
      projectId: id,
      tenantId: tenant.tenantId,
      userId: dbUserId,
    });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.update(id, dto, tenant.tenantId);
  }

  @Get(':id/environments/:environmentId/auth')
  @RequirePermission(Perms.manageProjectAuthSettings)
  async getAuth(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.getAuth(id, environmentId, tenant.tenantId);
  }

  @Put(':id/environments/:environmentId/auth')
  @RequirePermission(Perms.manageProjectAuthSettings)
  async updateAuth(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: UpdateProjectAuthDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.updateAuth(id, environmentId, dto, tenant.tenantId);
  }

  @Get(':id/logging')
  @RequirePermission(Perms.manageProjectLoggingSettings)
  async getLogging(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    await this.gate(id, tenant, user);
    return this.projectService.getLogging(id, tenant.tenantId);
  }

  @Put(':id/logging')
  @RequirePermission(Perms.manageProjectLoggingSettings)
  async updateLogging(
    @Param('id') id: string,
    @Body() dto: UpdateProjectLoggingDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.updateLogging(id, dto, tenant.tenantId);
  }

  @Put(':id/pod-class')
  @RequirePermission(Perms.manageProjectPodSettings)
  async updatePodClass(
    @Param('id') id: string,
    @Body() dto: UpdateProjectPodClassDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.updatePodClass(id, dto, tenant.tenantId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    await this.gate(id, tenant, user);
    return this.projectService.remove(id, tenant.tenantId);
  }

  @Post(':id/duplicate')
  @RequirePermission(Perms.duplicateProject)
  async duplicate(
    @Param('id') id: string,
    @Body() dto: DuplicateProjectDto | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.duplicate(id, tenant.tenantId, dto);
  }

  @Post(':id/disable')
  @RequirePermission(Perms.disableProject)
  async disable(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    await this.gate(id, tenant, user);
    return this.projectService.disable(id, tenant.tenantId);
  }

  @Post(':id/enable')
  @RequirePermission(Perms.disableProject)
  async enable(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    await this.gate(id, tenant, user);
    return this.projectService.enable(id, tenant.tenantId);
  }

  @Post(':id/restart')
  @RequirePermission(Perms.restartProject)
  async restart(@Param('id') id: string, @CurrentTenant() tenant: TenantContext, @CurrentUser() user: UserContext) {
    await this.gate(id, tenant, user);
    return this.projectService.restart(id, tenant.tenantId);
  }

  @Get(':id/environments')
  async listEnvironments(
    @Param('id') id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.listEnvironments(id, tenant.tenantId);
  }

  @Post(':id/environments/:environmentId/restart')
  @RequirePermission(Perms.restartProject)
  async restartEnvironment(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.restart(id, tenant.tenantId, environmentId);
  }

  @Get(':id/environments/:environmentId/variables')
  @RequirePermission(Perms.manageEnvironmentVariables)
  async getEnvironmentVariables(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.environmentVariablesService.getVariables(id, environmentId);
  }

  @Put(':id/environments/:environmentId/variables')
  @RequirePermission(Perms.manageEnvironmentVariables)
  async updateEnvironmentVariables(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: UpdateEnvironmentVariablesDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    const result = await this.environmentVariablesService.updateVariables(id, environmentId, dto);
    if (result.restart === 'pod') {
      await this.projectService.restart(id, tenant.tenantId, environmentId);
    }
    return result;
  }

  @Patch(':id/environments/:environmentId/session')
  async setEnvironmentSession(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @Body() dto: SetEnvironmentSessionDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    if (dto?.sessionId !== null && typeof dto?.sessionId !== 'string') {
      throw new BadRequestException('sessionId must be a string or null');
    }
    await this.projectService.setEnvironmentSession(id, environmentId, tenant.tenantId, dto.sessionId);
    return { ok: true };
  }

  @Delete(':id/environments/:environmentId')
  @RequirePermission(Perms.deleteEnvironment)
  async removeEnvironment(
    @Param('id') id: string,
    @Param('environmentId') environmentId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    await this.projectService.removeEnvironment(id, environmentId, tenant.tenantId);
    return { ok: true };
  }

  @Patch(':id/app/pin')
  @RequirePermission(Perms.pinApps)
  async setAppPin(
    @Param('id') id: string,
    @Body() dto: SetAppPinDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    if (typeof dto?.isPinned !== 'boolean') {
      throw new BadRequestException('isPinned must be a boolean');
    }
    const dbUserId = await this.resolveUserId(user, tenant.tenantId);
    return this.projectService.setAppPin(id, tenant.tenantId, dbUserId, dto.isPinned, dto.environmentId);
  }

  @Patch(':id/app')
  @RequirePermission(Perms.editAppDetails)
  async updateApp(
    @Param('id') id: string,
    @Body() dto: UpdateAppDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext
  ) {
    await this.gate(id, tenant, user);
    return this.projectService.updateApp(id, tenant.tenantId, dto ?? {});
  }

  /** 404 if the caller can't see this project (avoids existence leak). */
  private async gate(projectId: string, tenant: TenantContext, user: UserContext): Promise<void> {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId);
    await this.projectService.findOneForUser({
      projectId,
      tenantId: tenant.tenantId,
      userId: dbUserId,
    });
  }

  /** Keycloak sub → DB users.id uuid. workspace_members/prefs reference this. */
  private async resolveUserId(user: UserContext, tenantId: string): Promise<string> {
    const row = await this.userService.getOrCreateUser(
      {
        keycloakId: user.userId,
        email: user.email ?? undefined,
        displayName: user.displayName ?? undefined,
      },
      tenantId
    );
    return row.id;
  }
}

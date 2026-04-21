import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"
import { ProjectService } from "./project.service"
import { CreateProjectDto, UpdateProjectDto, DuplicateProjectDto } from "./project.types"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { CurrentUser, type UserContext } from "../user/user.decorator"
import { UserService } from "../user/user.service"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"
import { getGroupsHeader, hasPermission } from "../permission/permission.utils"

function canManageWorkspaces(req: FastifyRequest): boolean {
  return hasPermission(getGroupsHeader(req), Perms.manageWorkspaces)
}

@Controller("projects")
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
  ) {}

  /**
   * Create an unassigned project. Admin-only because unassigned projects are
   * invisible to non-admins. Workspace-scoped creation uses
   * POST /workspaces/:id/projects.
   */
  @Post()
  @RequirePermission(Perms.manageWorkspaces)
  create(@Body() dto: CreateProjectDto | undefined, @CurrentTenant() tenant: TenantContext) {
    return this.projectService.create(dto, tenant.tenantId)
  }

  @Get()
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId)
    return this.projectService.findAllForUser({
      tenantId: tenant.tenantId,
      userId: dbUserId,
      canManageWorkspaces: canManageWorkspaces(req),
    })
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId)
    return this.projectService.findOneForUser({
      projectId: id,
      tenantId: tenant.tenantId,
      userId: dbUserId,
      canManageWorkspaces: canManageWorkspaces(req),
    })
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.update(id, dto, tenant.tenantId)
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.remove(id, tenant.tenantId)
  }

  @Post(":id/duplicate")
  @RequirePermission(Perms.duplicateProject)
  async duplicate(
    @Param("id") id: string,
    @Body() dto: DuplicateProjectDto | undefined,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.duplicate(id, tenant.tenantId, dto)
  }

  @Post(":id/disable")
  @RequirePermission(Perms.disableProject)
  async disable(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.disable(id, tenant.tenantId)
  }

  @Post(":id/enable")
  @RequirePermission(Perms.disableProject)
  async enable(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.enable(id, tenant.tenantId)
  }

  /** 404 if the caller can't see this project (avoids existence leak). */
  private async gate(
    projectId: string,
    tenant: TenantContext,
    user: UserContext,
    req: FastifyRequest,
  ): Promise<void> {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId)
    await this.projectService.findOneForUser({
      projectId,
      tenantId: tenant.tenantId,
      userId: dbUserId,
      canManageWorkspaces: canManageWorkspaces(req),
    })
  }

  /** Keycloak sub → DB users.id uuid. workspace_members/prefs reference this. */
  private async resolveUserId(user: UserContext, tenantId: string): Promise<string> {
    const row = await this.userService.getOrCreateUser(
      {
        keycloakId: user.userId,
        email: user.email ?? undefined,
        displayName: user.displayName ?? undefined,
      },
      tenantId,
    )
    return row.id
  }
}

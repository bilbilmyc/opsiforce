import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"
import { getGroupsHeader, hasPermission } from "../permission/permission.utils"
import { CurrentUser, type UserContext } from "../user/user.decorator"
import { UserService, type UserRecord } from "../user/user.service"
import type { CreateProjectDto, ProjectResponse } from "../project/project.types"
import { WorkspaceService } from "./workspace.service"
import type {
  AddWorkspaceMemberDto,
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponse,
} from "./workspace.types"

function readPerms(req: FastifyRequest) {
  const groups = getGroupsHeader(req)
  return {
    canManageWorkspaces: hasPermission(groups, Perms.manageWorkspaces),
    canMoveProjectsBetweenWorkspaces: hasPermission(
      groups,
      Perms.moveProjectsBetweenWorkspaces,
    ),
  }
}

@Controller("workspaces")
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly userService: UserService,
  ) {}

  @Get()
  async findAll(
    @Query("scope") scope: string | undefined,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<WorkspaceResponse[]> {
    if (scope === "all") {
      if (!readPerms(req).canManageWorkspaces) {
        throw new ForbiddenException(`Missing permission: ${Perms.manageWorkspaces}`)
      }
      return this.workspaceService.findAllForAdmin(tenant.tenantId)
    }
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.findAll({
      userId: dbUser.id,
      tenantId: tenant.tenantId,
    })
  }

  @Post()
  @RequirePermission(Perms.manageWorkspaces)
  async create(
    @Body() dto: CreateWorkspaceDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<WorkspaceResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.create(dto, tenant.tenantId, dbUser.id)
  }

  @Get(":id")
  async findOne(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<WorkspaceResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.findOne({
      workspaceId: id,
      userId: dbUser.id,
      tenantId: tenant.tenantId,
      canManageWorkspaces: readPerms(req).canManageWorkspaces,
    })
  }

  @Patch(":id")
  @RequirePermission(Perms.manageWorkspaces)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateWorkspaceDto,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<WorkspaceResponse> {
    return this.workspaceService.update(id, dto, tenant.tenantId)
  }

  @Delete(":id")
  @RequirePermission(Perms.manageWorkspaces)
  async remove(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    await this.workspaceService.remove(id, tenant.tenantId)
  }

  @Get(":id/members")
  async listMembers(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<UserRecord[]> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.listMembers({
      workspaceId: id,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
      canManageWorkspaces: readPerms(req).canManageWorkspaces,
    })
  }

  @Post(":id/members")
  @RequirePermission(Perms.manageWorkspaces)
  async addMember(
    @Param("id") id: string,
    @Body() dto: AddWorkspaceMemberDto,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    await this.workspaceService.addMember(id, dto.userId, tenant.tenantId)
  }

  @Delete(":id/members/:userId")
  @RequirePermission(Perms.manageWorkspaces)
  async removeMember(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<void> {
    await this.workspaceService.removeMember(id, userId, tenant.tenantId)
  }

  @Get(":id/projects")
  async listProjects(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<ProjectResponse[]> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.listProjects({
      workspaceId: id,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
      canManageWorkspaces: readPerms(req).canManageWorkspaces,
    })
  }

  @Post(":id/projects")
  async createProjectInWorkspace(
    @Param("id") id: string,
    @Body() dto: CreateProjectDto | undefined,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<ProjectResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.createProjectInWorkspace({
      workspaceId: id,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
      canManageWorkspaces: readPerms(req).canManageWorkspaces,
      dto,
    })
  }

  @Post(":id/projects/:projectId")
  async assignProject(
    @Param("id") id: string,
    @Param("projectId") projectId: string,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<ProjectResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.assignProject({
      workspaceId: id,
      projectId,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
      ...readPerms(req),
    })
  }

  @Delete(":id/projects/:projectId")
  @RequirePermission(Perms.manageWorkspaces)
  async unassignProject(
    @Param("id") _id: string,
    @Param("projectId") projectId: string,
    @Req() req: FastifyRequest,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
  ): Promise<ProjectResponse> {
    const dbUser = await this.ensureDbUser(user)
    return this.workspaceService.assignProject({
      workspaceId: null,
      projectId,
      tenantId: tenant.tenantId,
      userId: dbUser.id,
      ...readPerms(req),
    })
  }

  /** Keycloak sub → DB user row. Handlers need the uuid for FK references. */
  private ensureDbUser(user: UserContext): Promise<UserRecord> {
    return this.userService.getOrCreateUser({
      keycloakId: user.userId,
      email: user.email ?? undefined,
      displayName: user.displayName ?? undefined,
    })
  }
}

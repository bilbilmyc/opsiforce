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
import { ProxyService } from "../proxy/proxy.service"

interface AppMetaResponse {
  exists: boolean
  name?: string
  description?: string
}

function canManageWorkspaces(req: FastifyRequest): boolean {
  return hasPermission(getGroupsHeader(req), Perms.manageWorkspaces)
}

@Controller("projects")
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
    private readonly proxyService: ProxyService,
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

  @Get(":id/app-meta")
  async getAppMeta(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ): Promise<AppMetaResponse> {
    await this.gate(id, tenant, user, req)

    const ensured = await this.projectService.ensureProjectById(id, "app")
    if (ensured.state !== "ready") {
      return { exists: false }
    }

    const upstream = this.proxyService.resolveAppUpstreamForProject(ensured.project)

    try {
      const response = await fetch(`${upstream}/api/app-meta`, {
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return { exists: false }
      }

      const payload = await response.json()
      if (!isAppMetaResponse(payload)) {
        return { exists: false }
      }

      return payload
    } catch {
      return { exists: false }
    }
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

function isAppMetaResponse(value: unknown): value is AppMetaResponse {
  if (!value || typeof value !== "object") return false

  const payload = value as Record<string, unknown>

  return typeof payload.exists === "boolean"
    && isOptionalString(payload.name)
    && isOptionalString(payload.description)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value == null || typeof value === "string"
}

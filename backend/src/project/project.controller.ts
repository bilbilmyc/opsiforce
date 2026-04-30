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
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common"
import type { FastifyReply, FastifyRequest } from "fastify"
import { ProjectService } from "./project.service"
import {
  CreateProjectDto,
  UpdateProjectDto,
  DuplicateProjectDto,
  UpdateProjectAuthDto,
  ProjectStatus,
} from "./project.types"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { CurrentUser, type UserContext } from "../user/user.decorator"
import { UserService } from "../user/user.service"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"
import { getGroupsHeader, hasPermission } from "../permission/permission.utils"
import { ProjectEventsService } from "./project-events.service"
import { AppService } from "./app.service"

function canManageWorkspaces(req: FastifyRequest): boolean {
  return hasPermission(getGroupsHeader(req), Perms.manageWorkspaces)
}

@Controller("projects")
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly userService: UserService,
    private readonly projectEventsService: ProjectEventsService,
    private readonly appService: AppService,
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

  @Get(":id/events")
  async streamStatus(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const dbUserId = await this.resolveUserId(user, tenant.tenantId)
    const loadStatus = () =>
      this.projectService.getState({
        projectId: id,
        tenantId: tenant.tenantId,
        userId: dbUserId,
        canManageWorkspaces: canManageWorkspaces(req),
      })

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "x-no-compression": "1",
    })

    let closed = false
    let unsubscribe = () => {}
    let polling = false
    const heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(": ping\n\n")
    }, 25000)
    const close = () => {
      closed = true
      clearInterval(heartbeat)
      unsubscribe()
      if (polling) {
        this.appService.stopPolling(id)
        polling = false
      }
    }

    const sendError = (code: "not_found" | "forbidden" | "internal", message: string) => {
      if (closed) return
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ code, message })}\n\n`)
      reply.raw.end()
      close()
    }

    const send = async () => {
      if (closed) return
      try {
        const status = await loadStatus()
        if (closed) return
        reply.raw.write(`data: ${JSON.stringify(status)}\n\n`)

        const shouldPoll =
          status.status === ProjectStatus.Active && (status.app === null || status.app.exists === false)
        if (shouldPoll && !polling) {
          this.appService.startPolling(id)
          polling = true
        } else if (!shouldPoll && polling) {
          this.appService.stopPolling(id)
          polling = false
        }
      } catch (err) {
        if (err instanceof NotFoundException) sendError("not_found", err.message)
        else if (err instanceof ForbiddenException) sendError("forbidden", err.message)
        else sendError("internal", err instanceof Error ? err.message : "Internal error")
      }
    }

    unsubscribe = this.projectEventsService.subscribe(id, () => {
      void send()
    })

    req.raw.on("close", close)
    await send()
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

  @Get(":id/auth")
  async getAuth(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.getAuth(id, tenant.tenantId)
  }

  @Put(":id/auth")
  async updateAuth(
    @Param("id") id: string,
    @Body() dto: UpdateProjectAuthDto,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.updateAuth(id, dto, tenant.tenantId)
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

  @Post(":id/restart")
  @RequirePermission(Perms.restartProject)
  async restart(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: UserContext,
    @Req() req: FastifyRequest,
  ) {
    await this.gate(id, tenant, user, req)
    return this.projectService.restart(id, tenant.tenantId)
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


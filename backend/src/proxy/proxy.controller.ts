import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { ProjectService, type EnsureProjectResult } from "../project/project.service"
import { ProjectResponse } from "../project/project.types"
import { OPSIFORCE_TENANT_GROUP_PREFIX, TenantService } from "../tenant/tenant.service"
import { Public } from "../tenant/tenant.decorator"
import { AgentUpdateService } from "../agent-update/agent-update.service"
import { ProxyService } from "./proxy.service"

type ProxySurface = "agent" | "app" | "vscode" | "db"

interface EnsureProxyBody {
  surface?: ProxySurface
}

interface EnsureProxyResponse {
  state: EnsureProjectResult["state"]
  upstream?: string
  podName?: string | null
  directory?: string
}

@Public()
@Controller("internal/proxy")
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name)
  private readonly proxyControlToken: string

  constructor(
    private readonly configService: ConfigService,
    private readonly proxyService: ProxyService,
    private readonly projectService: ProjectService,
    private readonly tenantService: TenantService,
    private readonly agentUpdateService: AgentUpdateService,
  ) {
    this.proxyControlToken = this.configService.getOrThrow<string>("proxyControlToken")
  }

  @Post("projects/:projectId/ensure")
  async ensureProject(
    @Param("projectId") projectId: string,
    @Body() body: EnsureProxyBody,
    @Headers("x-proxy-control-token") token: string | undefined,
    @Headers("x-forwarded-groups") groupsHeader: string | undefined,
  ): Promise<EnsureProxyResponse> {
    this.assertToken(token)

    const surface = body.surface
    if (!surface || !isProxySurface(surface)) {
      throw new BadRequestException("Invalid proxy surface")
    }

    const activity = surface === "app" ? "app" : "agent"
    let ensured: EnsureProjectResult

    if (surface === "agent") {
      const project = await this.projectService.findOneById(projectId)
      await this.assertProjectTenantAccess(project.tenantId, groupsHeader)
      ensured = await this.projectService.ensureProjectAccess(project, activity)
    } else {
      ensured = await this.projectService.ensureProjectById(projectId, activity)
    }

    if (surface === "agent" && ensured.state === "ready") {
      const reload = await this.agentUpdateService.applyPendingReloadForProject(projectId).catch((err) => {
        this.logger.warn(`Failed to apply pending agent reload for project ${projectId}: ${(err as Error).message}`)
        return null
      })
      if (reload?.podRecreated) {
        ensured = await this.projectService.ensureProjectById(projectId, activity)
      }
    }

    return this.toEnsureResponse(surface, ensured.project, ensured)
  }

  @Post("projects/:projectId/failure")
  async handleProjectFailure(
    @Param("projectId") projectId: string,
    @Headers("x-proxy-control-token") token: string | undefined,
  ): Promise<{ restart: boolean }> {
    this.assertToken(token)
    return { restart: await this.projectService.handleProxyFailureById(projectId) }
  }

  private toEnsureResponse(
    surface: ProxySurface,
    project: ProjectResponse,
    ensured: EnsureProjectResult,
  ): EnsureProxyResponse {
    if (ensured.state !== "ready") {
      return { state: ensured.state }
    }

    const upstream = resolveUpstreamForSurface(this.proxyService, surface, project)

    return {
      state: ensured.state,
      upstream,
      podName: project.podName,
      directory: project.directory,
    }
  }

  private async assertProjectTenantAccess(
    tenantId: string,
    groupsHeader: string | undefined,
  ): Promise<void> {
    if (!groupsHeader) throw new ForbiddenException("No tenant groups found")

    const tenantNames = this.tenantService.parseGroupsByPrefix(groupsHeader, OPSIFORCE_TENANT_GROUP_PREFIX)
    if (tenantNames.length === 0) throw new ForbiddenException("No opsiforce tenants assigned")

    const tenant = await this.tenantService.getTenantById(tenantId)
    if (!tenant || !tenantNames.includes(tenant.name)) {
      throw new NotFoundException("Project not found")
    }
  }

  private assertToken(token: string | undefined): void {
    if (!token || token !== this.proxyControlToken) {
      throw new UnauthorizedException("Invalid proxy control token")
    }
  }
}

function resolveUpstreamForSurface(
  proxyService: ProxyService,
  surface: ProxySurface,
  project: ProjectResponse,
): string {
  switch (surface) {
    case "agent":
      return proxyService.resolveUpstreamForProject(project)
    case "app":
      return proxyService.resolveAppUpstreamForProject(project)
    case "vscode":
      return proxyService.resolveVscodeUpstreamForProject(project)
    case "db":
      return proxyService.resolveDbUpstreamForProject(project)
  }
}

function isProxySurface(value: string): value is ProxySurface {
  return value === "agent" || value === "app" || value === "vscode" || value === "db"
}

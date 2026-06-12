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
import { appCanonicalHost } from "../common/app-host"
import { ProjectService, type EnsureEnvironmentResult } from "../project/project.service"
import { RequestLogMode } from "../project/project.types"
import { ProjectEnvironmentService } from "../project-environment/project-environment.service"
import type { ProjectEnvironmentContext } from "../project-environment/project-environment.types"
import { OPSIFORCE_TENANT_GROUP_PREFIX, TenantService } from "../tenant/tenant.service"
import { Public } from "../tenant/tenant.decorator"
import { AgentUpdateService } from "../agent-update/agent-update.service"
import { ProxyService } from "./proxy.service"

type ProxySurface = "agent" | "app" | "vscode" | "db"

interface EnsureProxyBody {
  surface?: ProxySurface
}

interface ProxyLoggingConfig {
  mode: RequestLogMode
  bodyLimit: number
}

interface EnsureProxyResponse {
  state: EnsureEnvironmentResult["state"]
  canonicalHost?: string
  upstream?: string
  podName?: string | null
  directory?: string
  logging?: ProxyLoggingConfig
}

@Public()
@Controller("internal/proxy")
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name)
  private readonly proxyControlToken: string
  private readonly appsHostname: string

  constructor(
    private readonly configService: ConfigService,
    private readonly proxyService: ProxyService,
    private readonly projectService: ProjectService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly tenantService: TenantService,
    private readonly agentUpdateService: AgentUpdateService,
  ) {
    this.proxyControlToken = this.configService.getOrThrow<string>("proxyControlToken")
    this.appsHostname = this.configService.getOrThrow<string>("appsHostname")
  }

  @Post("projects/:environmentId/ensure")
  async ensureEnvironment(
    @Param("environmentId") environmentId: string,
    @Body() body: EnsureProxyBody,
    @Headers("x-proxy-control-token") token: string | undefined,
    @Headers("x-forwarded-groups") groupsHeader: string | undefined,
  ): Promise<EnsureProxyResponse> {
    this.assertToken(token)

    const surface = body.surface
    if (!surface || !isProxySurface(surface)) {
      throw new BadRequestException("Invalid proxy surface")
    }

    const env = await this.projectEnvironmentService.findByIdOrNull(environmentId)
    if (!env) throw new NotFoundException(`Project environment ${environmentId} not found`)

    if (surface === "agent") {
      if (!env.tenantId) throw new BadRequestException(`Project environment ${environmentId} not yet claimed`)
      await this.assertProjectTenantAccess(env.tenantId, groupsHeader)
    }

    const activity = surface === "app" ? "app" : "agent"
    let ensured = await this.projectService.ensureEnvironment(env, activity)

    if (surface === "agent" && ensured.state === "ready" && env.isDefault) {
      const reload = await this.agentUpdateService.applyPendingReloadForProject(env.projectId).catch((err) => {
        this.logger.warn(`Failed to apply pending agent reload for project ${env.projectId}: ${(err as Error).message}`)
        return null
      })
      if (reload?.podRecreated) {
        ensured = await this.projectService.ensureEnvironmentById(environmentId, activity)
      }
    }

    return this.toEnsureResponse(surface, ensured, env)
  }

  @Post("projects/:environmentId/failure")
  async handleEnvironmentFailure(
    @Param("environmentId") environmentId: string,
    @Headers("x-proxy-control-token") token: string | undefined,
  ): Promise<{ restart: boolean }> {
    this.assertToken(token)
    return { restart: await this.projectService.handleProxyFailureByEnvId(environmentId) }
  }

  private toEnsureResponse(
    surface: ProxySurface,
    ensured: EnsureEnvironmentResult,
    resolved: ProjectEnvironmentContext,
  ): EnsureProxyResponse {
    const canonical =
      surface === "app"
        ? { canonicalHost: appCanonicalHost(resolved.id, resolved.environmentSlug, this.appsHostname) }
        : {}

    if (ensured.state !== "ready") {
      return { state: ensured.state, ...canonical }
    }

    const env = ensured.env
    const upstream = resolveUpstreamForSurface(this.proxyService, surface, env)

    return {
      state: ensured.state,
      ...canonical,
      upstream,
      podName: this.proxyService.getAssignedPodName(env.id),
      directory: env.directory,
      ...(surface === "app"
        ? { logging: { mode: env.requestLogMode, bodyLimit: env.requestLogBodyLimit } }
        : {}),
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
  env: ProjectEnvironmentContext,
): string {
  switch (surface) {
    case "agent":
      return proxyService.resolveUpstreamForProject(env)
    case "app":
      return proxyService.resolveAppUpstreamForProject(env)
    case "vscode":
      return proxyService.resolveVscodeUpstreamForProject(env)
    case "db":
      return proxyService.resolveDbUpstreamForProject(env)
  }
}

function isProxySurface(value: string): value is ProxySurface {
  return value === "agent" || value === "app" || value === "vscode" || value === "db"
}

import { Controller, Get, Put, Param, Body, BadRequestException } from "@nestjs/common"
import { BifrostService } from "./bifrost.service"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { ProjectService } from "../project/project.service"
import type {
  KeyType,
  BifrostLogStats,
  KeyTypeUsage,
  ProjectBudgetEntry,
  UpdateBudgetRequest,
  ProjectUsageResponse,
  TenantUsageResponse,
} from "./bifrost.types"

const VALID_KEY_TYPES: KeyType[] = ["chat", "backend"]
const VALID_DURATIONS = ["1m", "1h", "1d", "1w", "1M", "1Y"]

function mapKeyTypeStats(entries: Array<{ keyType: KeyType } & BifrostLogStats>): KeyTypeUsage[] {
  return entries.map((kt) => ({
    keyType: kt.keyType,
    totalRequests: kt.total_requests,
    totalTokens: kt.total_tokens,
    totalCost: kt.total_cost,
    averageLatency: kt.average_latency,
    successRate: kt.success_rate,
  }))
}

@Controller("usage")
export class UsageController {
  constructor(
    private readonly bifrostService: BifrostService,
    private readonly projectService: ProjectService,
  ) {}

  @Get()
  async getTenantUsage(@CurrentTenant() tenant: TenantContext): Promise<TenantUsageResponse> {
    if (!this.bifrostService.isEnabled()) {
      return { tenantId: tenant.tenantId, totalRequests: 0, totalTokens: 0, totalCost: 0, projects: [] }
    }

    const stats = await this.bifrostService.getTenantUsage(tenant.tenantId)
    const projects = await this.projectService.findAll(tenant.tenantId)

    const projectUsages: ProjectUsageResponse[] = []
    for (const project of projects) {
      const { aggregate, byKeyType } = await this.bifrostService.getProjectUsage(project.id)
      if (aggregate) {
        projectUsages.push({
          projectId: project.id,
          totalRequests: aggregate.total_requests,
          totalTokens: aggregate.total_tokens,
          totalCost: aggregate.total_cost,
          averageLatency: aggregate.average_latency,
          successRate: aggregate.success_rate,
          byKeyType: mapKeyTypeStats(byKeyType),
        })
      }
    }

    return {
      tenantId: tenant.tenantId,
      totalRequests: stats.total_requests,
      totalTokens: stats.total_tokens,
      totalCost: stats.total_cost,
      projects: projectUsages,
    }
  }

  @Get("projects/:id")
  async getProjectUsage(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<ProjectUsageResponse> {
    await this.projectService.findOne(id, tenant.tenantId)

    if (!this.bifrostService.isEnabled()) {
      return { projectId: id, totalRequests: 0, totalTokens: 0, totalCost: 0, averageLatency: 0, successRate: 0 }
    }

    const { aggregate, byKeyType } = await this.bifrostService.getProjectUsage(id)
    return {
      projectId: id,
      totalRequests: aggregate?.total_requests ?? 0,
      totalTokens: aggregate?.total_tokens ?? 0,
      totalCost: aggregate?.total_cost ?? 0,
      averageLatency: aggregate?.average_latency ?? 0,
      successRate: aggregate?.success_rate ?? 0,
      byKeyType: mapKeyTypeStats(byKeyType),
    }
  }

  @Get("projects/:id/budgets")
  async getProjectBudgets(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<ProjectBudgetEntry[]> {
    await this.projectService.findOne(id, tenant.tenantId)
    if (!this.bifrostService.isEnabled()) return []
    return this.bifrostService.getProjectBudgets(id)
  }

  @Put("projects/:id/budgets")
  async updateProjectBudget(
    @Param("id") id: string,
    @Body() body: UpdateBudgetRequest,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<ProjectBudgetEntry[]> {
    await this.projectService.findOne(id, tenant.tenantId)
    if (!this.bifrostService.isEnabled()) {
      throw new BadRequestException("Bifrost is not enabled")
    }
    if (!VALID_KEY_TYPES.includes(body.keyType)) {
      throw new BadRequestException(`Invalid keyType: ${body.keyType}`)
    }
    if (!VALID_DURATIONS.includes(body.budgetDuration)) {
      throw new BadRequestException(`Invalid budgetDuration: ${body.budgetDuration}`)
    }
    if (typeof body.maxBudget !== "number" || body.maxBudget < 0) {
      throw new BadRequestException("maxBudget must be a non-negative number")
    }
    await this.bifrostService.updateKeyBudget(id, body.keyType, body.maxBudget, body.budgetDuration)
    return this.bifrostService.getProjectBudgets(id)
  }
}

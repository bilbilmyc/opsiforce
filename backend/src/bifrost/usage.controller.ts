import { Controller, Get, Param } from "@nestjs/common"
import { BifrostService } from "./bifrost.service"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { ProjectService } from "../project/project.service"
import type { ProjectUsageResponse, TenantUsageResponse } from "./bifrost.types"

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
      const usage = await this.bifrostService.getProjectUsage(project.id)
      if (usage) {
        projectUsages.push({
          projectId: project.id,
          totalRequests: usage.total_requests,
          totalTokens: usage.total_tokens,
          totalCost: usage.total_cost,
          averageLatency: usage.average_latency,
          successRate: usage.success_rate,
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

    const usage = await this.bifrostService.getProjectUsage(id)
    return {
      projectId: id,
      totalRequests: usage?.total_requests ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      totalCost: usage?.total_cost ?? 0,
      averageLatency: usage?.average_latency ?? 0,
      successRate: usage?.success_rate ?? 0,
    }
  }
}

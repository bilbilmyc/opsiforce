import { Body, Controller, Get, Patch } from "@nestjs/common"
import { DefaultsService } from "./defaults.service"
import { RequirePermission } from "../permission/permission.guard"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { AVAILABLE_MODELS } from "./model-registry"
import type {
  TimeoutDefaults,
  BudgetDefaults,
  AgentDefaultsResponse,
  UpdateTimeoutDefaultsDto,
  UpdateBudgetDefaultsDto,
  UpdateAgentDefaultsDto,
} from "./defaults.types"

const MANAGE_PLATFORM = "can_manage_platform_defaults"
const MANAGE_TENANT = "can_manage_tenant_defaults"

@Controller("defaults")
export class DefaultsController {
  constructor(private readonly defaultsService: DefaultsService) {}

  @Get("global/timeouts")
  @RequirePermission(MANAGE_PLATFORM)
  getGlobalTimeouts(): Promise<TimeoutDefaults> {
    return this.defaultsService.getGlobalTimeouts()
  }

  @Patch("global/timeouts")
  @RequirePermission(MANAGE_PLATFORM)
  updateGlobalTimeouts(@Body() body: UpdateTimeoutDefaultsDto): Promise<TimeoutDefaults> {
    return this.defaultsService.updateGlobalTimeouts(body)
  }

  @Get("global/budgets")
  @RequirePermission(MANAGE_PLATFORM)
  getGlobalBudgets(): Promise<BudgetDefaults> {
    return this.defaultsService.getGlobalBudgets()
  }

  @Patch("global/budgets")
  @RequirePermission(MANAGE_PLATFORM)
  updateGlobalBudgets(@Body() body: UpdateBudgetDefaultsDto): Promise<BudgetDefaults> {
    return this.defaultsService.updateGlobalBudgets(body)
  }

  @Get("global/agent")
  @RequirePermission(MANAGE_PLATFORM)
  async getGlobalAgent(): Promise<AgentDefaultsResponse> {
    const agent = await this.defaultsService.getGlobalAgent()
    return { ...agent, availableModels: AVAILABLE_MODELS }
  }

  @Patch("global/agent")
  @RequirePermission(MANAGE_PLATFORM)
  async updateGlobalAgent(@Body() body: UpdateAgentDefaultsDto): Promise<AgentDefaultsResponse> {
    const agent = await this.defaultsService.updateGlobalAgent(body)
    return { ...agent, availableModels: AVAILABLE_MODELS }
  }

  @Get("tenant/timeouts")
  @RequirePermission(MANAGE_TENANT)
  getTenantTimeouts(@CurrentTenant() tenant: TenantContext): Promise<TimeoutDefaults> {
    return this.defaultsService.getTenantTimeouts(tenant.tenantId)
  }

  @Patch("tenant/timeouts")
  @RequirePermission(MANAGE_TENANT)
  updateTenantTimeouts(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateTimeoutDefaultsDto,
  ): Promise<TimeoutDefaults> {
    return this.defaultsService.updateTenantTimeouts(tenant.tenantId, body)
  }

  @Get("tenant/budgets")
  @RequirePermission(MANAGE_TENANT)
  getTenantBudgets(@CurrentTenant() tenant: TenantContext): Promise<BudgetDefaults> {
    return this.defaultsService.getTenantBudgets(tenant.tenantId)
  }

  @Patch("tenant/budgets")
  @RequirePermission(MANAGE_TENANT)
  updateTenantBudgets(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateBudgetDefaultsDto,
  ): Promise<BudgetDefaults> {
    return this.defaultsService.updateTenantBudgets(tenant.tenantId, body)
  }

  @Get("tenant/agent")
  @RequirePermission(MANAGE_TENANT)
  async getTenantAgent(@CurrentTenant() tenant: TenantContext): Promise<AgentDefaultsResponse> {
    const agent = await this.defaultsService.getTenantAgent(tenant.tenantId)
    return { ...agent, availableModels: AVAILABLE_MODELS }
  }

  @Patch("tenant/agent")
  @RequirePermission(MANAGE_TENANT)
  async updateTenantAgent(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateAgentDefaultsDto,
  ): Promise<AgentDefaultsResponse> {
    const agent = await this.defaultsService.updateTenantAgent(tenant.tenantId, body)
    return { ...agent, availableModels: AVAILABLE_MODELS }
  }
}

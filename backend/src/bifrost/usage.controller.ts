import { Controller, Get, Put, Param, Body, BadRequestException } from "@nestjs/common"
import { BifrostService } from "./bifrost.service"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { ProjectService } from "../project/project.service"
import { TenantService } from "../tenant/tenant.service"
import type {
  KeyType,
  BifrostBudget,
  ProjectBudgetEntry,
  UpdateBudgetRequest,
  ProjectBudgetResponse,
  TenantBudgetResponse,
  UpdateTenantBudgetRequest,
  UpdateProjectBudgetRequest,
} from "./bifrost.types"

const VALID_KEY_TYPES: KeyType[] = ["chat", "backend"]
const VALID_DURATIONS = ["1m", "1h", "1d", "1w", "1M", "1Y"]

function toBudgetResponse(budget: BifrostBudget | null) {
  return {
    maxBudget: budget?.max_limit ?? null,
    budgetDuration: budget?.reset_duration ?? null,
    currentUsage: budget?.current_usage ?? 0,
  }
}

function toKeyBudgetEntries(keyBudgets: Array<{ keyType: KeyType; budget: BifrostBudget | null }>): ProjectBudgetEntry[] {
  return keyBudgets.map((kb) => ({ keyType: kb.keyType, ...toBudgetResponse(kb.budget) }))
}

@Controller("usage")
export class UsageController {
  constructor(
    private readonly bifrostService: BifrostService,
    private readonly projectService: ProjectService,
    private readonly tenantService: TenantService,
  ) {}

  @Get("projects/:id/budgets")
  async getProjectBudgets(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<ProjectBudgetEntry[]> {
    await this.projectService.findOne(id, tenant.tenantId)
    if (!this.bifrostService.isEnabled()) return []
    return toKeyBudgetEntries(await this.bifrostService.getProjectKeyBudgets(id))
  }

  @Put("projects/:id/budgets")
  async updateProjectKeyBudget(
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
    return toKeyBudgetEntries(await this.bifrostService.getProjectKeyBudgets(id))
  }

  @Get("projects/:id/budget")
  async getProjectBudget(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<ProjectBudgetResponse> {
    const project = await this.projectService.findOne(id, tenant.tenantId)
    if (!this.bifrostService.isEnabled() || !project.bifrostProjectId) {
      return { maxBudget: null, budgetDuration: null, currentUsage: 0 }
    }
    return toBudgetResponse(await this.bifrostService.getTeamBudget(project.bifrostProjectId))
  }

  @Put("projects/:id/budget")
  async updateProjectBudgetLimit(
    @Param("id") id: string,
    @Body() body: UpdateProjectBudgetRequest,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<ProjectBudgetResponse & { warning?: string }> {
    const project = await this.projectService.findOne(id, tenant.tenantId)
    if (!this.bifrostService.isEnabled()) {
      throw new BadRequestException("Bifrost is not enabled")
    }
    if (typeof body.maxBudget !== "number" || body.maxBudget < 0) {
      throw new BadRequestException("maxBudget must be a non-negative number")
    }
    if (!VALID_DURATIONS.includes(body.budgetDuration)) {
      throw new BadRequestException(`Invalid budgetDuration: ${body.budgetDuration}`)
    }
    if (!project.bifrostProjectId) {
      throw new BadRequestException("Project has no Bifrost team")
    }

    const budget: BifrostBudget | undefined = body.maxBudget > 0
      ? { max_limit: body.maxBudget, reset_duration: body.budgetDuration }
      : undefined

    await this.bifrostService.updateTeamBudget(project.bifrostProjectId, budget)

    return toBudgetResponse(budget ?? null)
  }

  @Get("tenant/budget")
  async getTenantBudget(@CurrentTenant() tenant: TenantContext): Promise<TenantBudgetResponse> {
    const tenantRecord = await this.tenantService.getOrCreateTenant(tenant.tenantName)
    if (!tenantRecord.bifrostTenantId) {
      return { tenantBudget: null, budgetDuration: null, currentUsage: 0 }
    }
    const budget = await this.bifrostService.getCustomerBudget(tenantRecord.bifrostTenantId)
    return {
      tenantBudget: budget?.max_limit ?? null,
      budgetDuration: budget?.reset_duration ?? null,
      currentUsage: budget?.current_usage ?? 0,
    }
  }

  @Put("tenant/budget")
  async updateTenantBudgetConfig(
    @Body() body: UpdateTenantBudgetRequest,
    @CurrentTenant() tenant: TenantContext,
  ): Promise<TenantBudgetResponse> {
    if (!this.bifrostService.isEnabled()) {
      throw new BadRequestException("Bifrost is not enabled")
    }
    if (!VALID_DURATIONS.includes(body.budgetDuration)) {
      throw new BadRequestException(`Invalid budgetDuration: ${body.budgetDuration}`)
    }
    if (typeof body.tenantBudget !== "number" || body.tenantBudget < 0) {
      throw new BadRequestException("tenantBudget must be a non-negative number")
    }

    const tenantRecord = await this.tenantService.getOrCreateTenant(tenant.tenantName)
    if (!tenantRecord.bifrostTenantId) {
      throw new BadRequestException("Tenant has no Bifrost customer")
    }

    const budget: BifrostBudget | undefined = body.tenantBudget > 0
      ? { max_limit: body.tenantBudget, reset_duration: body.budgetDuration }
      : undefined

    await this.bifrostService.updateCustomerBudget(tenantRecord.bifrostTenantId, budget)

    return {
      tenantBudget: budget?.max_limit ?? null,
      budgetDuration: body.budgetDuration,
      currentUsage: 0,
    }
  }
}

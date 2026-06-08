import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common"
import { EnvironmentService } from "./environment.service"
import { CreateEnvironmentDto, UpdateEnvironmentDto } from "./environment.types"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"

@Controller("environments")
export class EnvironmentController {
  constructor(private readonly environmentService: EnvironmentService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.environmentService.listForTenant(tenant.tenantId)
  }

  @Post()
  @RequirePermission(Perms.manageEnvironments)
  create(@Body() dto: CreateEnvironmentDto, @CurrentTenant() tenant: TenantContext) {
    return this.environmentService.create(tenant.tenantId, dto ?? {})
  }

  @Patch(":id")
  @RequirePermission(Perms.manageEnvironments)
  update(@Param("id") id: string, @Body() dto: UpdateEnvironmentDto, @CurrentTenant() tenant: TenantContext) {
    return this.environmentService.update(tenant.tenantId, id, dto ?? {})
  }

  @Delete(":id")
  @RequirePermission(Perms.manageEnvironments)
  async remove(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    await this.environmentService.remove(tenant.tenantId, id)
    return { ok: true }
  }
}

import { Body, Controller, Get, Headers, Put } from "@nestjs/common"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { Perms } from "../permission/permission.constants"
import { RequirePermission } from "../permission/permission.guard"
import { TenantSettingsService } from "./tenant-settings.service"
import type { TenantSettingsResponse, UpdateTenantSettingsDto } from "./tenant-settings.types"

@Controller("tenant-settings")
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}

  @Get()
  @RequirePermission(Perms.manageMakaraIntegration)
  get(@CurrentTenant() tenant: TenantContext): Promise<TenantSettingsResponse> {
    return this.service.get(tenant.tenantId)
  }

  @Put()
  @RequirePermission(Perms.manageMakaraIntegration)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateTenantSettingsDto,
    @Headers("x-forwarded-groups") groupsHeader: string | undefined,
  ): Promise<TenantSettingsResponse> {
    return this.service.update(tenant.tenantId, body, groupsHeader)
  }
}

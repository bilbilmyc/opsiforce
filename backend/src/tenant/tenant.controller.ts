import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Perms } from '../permission/permission.constants';
import { RequirePermission } from '../permission/permission.guard';
import { CurrentTenant, type TenantContext } from './tenant.decorator';
import { OPSIFORCE_TENANT_GROUP_PREFIX, TenantService } from './tenant.service';
import type { TenantConfigResponse, UpdateTenantConfigDto } from './tenant.types';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async findAll(@Req() req: FastifyRequest) {
    const groupsHeader = (req.headers['x-forwarded-groups'] as string) ?? '';
    const tenantNames = this.tenantService.parseGroupsByPrefix(groupsHeader, OPSIFORCE_TENANT_GROUP_PREFIX);
    return this.tenantService.getOrCreateTenants(tenantNames);
  }

  @Get('config')
  getConfig(@CurrentTenant() tenant: TenantContext): Promise<TenantConfigResponse> {
    return this.tenantService.getTenantConfig(tenant.tenantId);
  }

  @Patch('config')
  @RequirePermission(Perms.manageWorkspaces)
  updateConfig(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: UpdateTenantConfigDto | undefined
  ): Promise<TenantConfigResponse> {
    return this.tenantService.updateTenantConfig(tenant, body);
  }
}

import { Controller, Get, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { OPSIFORCE_TENANT_GROUP_PREFIX, TenantService } from './tenant.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async findAll(@Req() req: FastifyRequest) {
    const groupsHeader = (req.headers['x-forwarded-groups'] as string) ?? '';
    const tenantNames = this.tenantService.parseGroupsByPrefix(groupsHeader, OPSIFORCE_TENANT_GROUP_PREFIX);
    return this.tenantService.getOrCreateTenants(tenantNames);
  }
}

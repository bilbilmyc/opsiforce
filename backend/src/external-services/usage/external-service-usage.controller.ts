import { Controller, Get, Query } from '@nestjs/common';
import { Perms } from '../../permission/permission.constants';
import { RequirePermission } from '../../permission/permission.guard';
import { CurrentTenant, type TenantContext } from '../../tenant/tenant.decorator';
import { ExternalServiceUsageService } from './external-service-usage.service';
import type { UsageView } from './external-service-usage.types';

@Controller('external-services/admin')
export class ExternalServiceUsageController {
  constructor(private readonly usageService: ExternalServiceUsageService) {}

  @Get('usage')
  @RequirePermission(Perms.viewExternalServicesUsage)
  usage(@CurrentTenant() tenant: TenantContext, @Query('month') month?: string): Promise<UsageView> {
    return this.usageService.view(month, tenant.tenantId);
  }
}

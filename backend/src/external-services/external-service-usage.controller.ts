import { Controller, Get, Query } from '@nestjs/common';
import { Perms } from '../permission/permission.constants';
import { RequirePermission } from '../permission/permission.guard';
import { ExternalServiceUsageService } from './external-service-usage.service';
import type { UsageView } from './external-service-usage.types';

@Controller('admin/external-services')
export class ExternalServiceUsageController {
  constructor(private readonly usageService: ExternalServiceUsageService) {}

  @Get('usage')
  @RequirePermission(Perms.viewExternalServicesUsage)
  usage(@Query('month') month?: string, @Query('tenantId') tenantId?: string): Promise<UsageView> {
    return this.usageService.view(month, tenantId);
  }
}

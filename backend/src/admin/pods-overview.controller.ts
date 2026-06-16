import { Controller, Get } from '@nestjs/common';
import { PodsOverviewService } from './pods-overview.service';
import { RequirePermission } from '../permission/permission.guard';
import { Perms } from '../permission/permission.constants';
import { CurrentTenant, type TenantContext } from '../tenant/tenant.decorator';
import type { PodsView } from './pods-overview.types';

@Controller('pods')
export class PodsOverviewController {
  constructor(private readonly podsOverviewService: PodsOverviewService) {}

  @Get()
  @RequirePermission(Perms.viewPods)
  list(@CurrentTenant() tenant: TenantContext): Promise<PodsView> {
    return this.podsOverviewService.listForTenant(tenant.tenantId);
  }
}

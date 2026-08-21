import { Controller, Get } from '@nestjs/common';
import { Perms } from '../permission/permission.constants';
import { RequirePermission } from '../permission/permission.guard';
import { PlatformScope } from '../tenant/tenant.decorator';
import { PlatformStorageService } from './platform-storage.service';
import type { PlatformStorageView } from './platform-storage.types';

@Controller('platform/storage')
export class PlatformStorageController {
  constructor(private readonly platformStorageService: PlatformStorageService) {}

  @Get()
  @PlatformScope()
  @RequirePermission(Perms.viewPlatformStorage)
  snapshot(): Promise<PlatformStorageView> {
    return this.platformStorageService.snapshot();
  }
}

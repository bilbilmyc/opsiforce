import { Controller, Get, Req } from '@nestjs/common';
import { PlatformScope } from '../tenant/tenant.decorator';
import { getGroupsHeader, parsePermissions } from './permission.utils';

@Controller('permissions')
export class PermissionController {
  @Get()
  @PlatformScope()
  getPermissions(@Req() req: { headers: Record<string, string | string[] | undefined> }): string[] {
    return parsePermissions(getGroupsHeader(req));
  }
}

import { Controller, Get, Req } from "@nestjs/common"
import { getGroupsHeader, parsePermissions } from "./permission.utils"

@Controller("permissions")
export class PermissionController {
  @Get()
  getPermissions(@Req() req: { headers: Record<string, string | string[] | undefined> }): string[] {
    return parsePermissions(getGroupsHeader(req))
  }
}

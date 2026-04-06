import { Controller, Get, Req } from "@nestjs/common"
import { FastifyRequest } from "fastify"

const OPSIFORCE_ROLE_PREFIX = "role:opsiforce_"
const TENANT_ROLE_PREFIX = "role:opsiforce_tenant_name_"

@Controller("permissions")
export class PermissionController {
  @Get()
  getPermissions(@Req() req: FastifyRequest): string[] {
    const groupsHeader = (req.headers["x-forwarded-groups"] as string) ?? ""
    return groupsHeader
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.startsWith(OPSIFORCE_ROLE_PREFIX) && !g.startsWith(TENANT_ROLE_PREFIX))
      .map((g) => g.replace(OPSIFORCE_ROLE_PREFIX, ""))
  }
}

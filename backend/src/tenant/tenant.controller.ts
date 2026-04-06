import { Controller, Get, Req } from "@nestjs/common"
import { FastifyRequest } from "fastify"
import { TenantService } from "./tenant.service"

@Controller("tenants")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  async findAll(@Req() req: FastifyRequest) {
    const groupsHeader = req.headers["x-forwarded-groups"] as string ?? ""
    const tenantNames = this.tenantService.parseTenantGroups(groupsHeader)
    return this.tenantService.getOrCreateTenants(tenantNames)
  }
}

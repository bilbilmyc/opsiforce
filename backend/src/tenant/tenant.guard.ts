import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { FastifyRequest } from "fastify"
import { TenantService } from "./tenant.service"
import { IS_PUBLIC_KEY, type TenantContext } from "./tenant.decorator"

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantService: TenantService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<FastifyRequest & { tenantContext: TenantContext }>()
    const groupsHeader = request.headers["x-forwarded-groups"] as string | undefined
    if (!groupsHeader) throw new ForbiddenException("No tenant groups found")

    const tenantNames = this.tenantService.parseTenantGroups(groupsHeader)
    if (tenantNames.length === 0) throw new ForbiddenException("No opsiforce tenants assigned")

    const requestedTenantName = (request.headers["x-tenant-name"] as string | undefined) ?? tenantNames[0]

    if (!tenantNames.includes(requestedTenantName)) {
      throw new ForbiddenException(`No access to tenant: ${requestedTenantName}`)
    }

    const tenant = await this.tenantService.getOrCreateTenant(requestedTenantName)

    request.tenantContext = { tenantId: tenant.id, tenantName: tenant.name }
    return true
  }
}

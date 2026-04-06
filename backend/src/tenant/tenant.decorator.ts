import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common"
import { FastifyRequest } from "fastify"

export interface TenantContext {
  tenantId: string
  tenantName: string
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { tenantContext: TenantContext }>()
    return request.tenantContext
  },
)

export const IS_PUBLIC_KEY = "isPublic"
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

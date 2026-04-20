import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common"
import { FastifyRequest } from "fastify"
import { GatewayKeyService, type GatewayIdentity } from "./gateway-key.service"

@Injectable()
export class GatewayAuthGuard implements CanActivate {
  constructor(private readonly gatewayKeyService: GatewayKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { gatewayContext?: GatewayIdentity }>()

    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Authorization header")
    }

    const token = authHeader.slice(7)
    const identity = await this.gatewayKeyService.validateToken(token)
    if (!identity) {
      throw new UnauthorizedException("Invalid gateway token")
    }

    request.gatewayContext = identity
    return true
  }
}

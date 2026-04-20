import { Controller, Post, Body, Req, UseGuards, BadRequestException } from "@nestjs/common"
import { FastifyRequest } from "fastify"
import { Public } from "../tenant/tenant.decorator"
import { GatewayAuthGuard } from "./gateway-auth.guard"
import { GatewayService } from "./gateway.service"
import type { GatewayIdentity } from "./gateway-key.service"

interface GatewayRequestBody {
  service: string
  payload: unknown
}

@Public()
@UseGuards(GatewayAuthGuard)
@Controller("gateway")
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Post()
  async handle(
    @Body() body: GatewayRequestBody,
    @Req() req: FastifyRequest & { gatewayContext?: GatewayIdentity },
  ) {
    if (!body?.service) {
      throw new BadRequestException("Missing 'service' field")
    }

    const context = req.gatewayContext!

    const result = await this.gatewayService.dispatch(body.service, body.payload, context)

    if (result.success) {
      return { success: true, data: result.data }
    }

    return { success: false, error: result.error }
  }
}

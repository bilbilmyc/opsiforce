import { Controller, Get, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Public } from '../tenant/tenant.decorator';
import { GatewayAuthGuard } from '../gateway/gateway-auth.guard';
import type { GatewayIdentity } from '../gateway/gateway-key.service';
import { IncomingEmailAddressService } from './incoming-email-address.service';

type GatewayRequest = FastifyRequest & { gatewayContext?: GatewayIdentity };

function environmentIdOf(req: GatewayRequest): string {
  const projectEnvironmentId = req.gatewayContext?.projectEnvironmentId;
  if (!projectEnvironmentId) {
    throw new BadRequestException('Incoming-email addresses require an environment-scoped gateway key');
  }
  return projectEnvironmentId;
}

@Public()
@UseGuards(GatewayAuthGuard)
@Controller('gateway/external-services/incoming-email')
export class IncomingEmailAddressController {
  constructor(private readonly incomingEmailAddressService: IncomingEmailAddressService) {}

  @Get('address')
  async getAddress(@Req() req: GatewayRequest): Promise<{ address: string }> {
    const address = await this.incomingEmailAddressService.getOrCreateAddress(environmentIdOf(req));
    return { address };
  }

  @Post('address/regenerate')
  async regenerateAddress(@Req() req: GatewayRequest): Promise<{ address: string }> {
    const address = await this.incomingEmailAddressService.regenerateAddress(environmentIdOf(req));
    return { address };
  }
}

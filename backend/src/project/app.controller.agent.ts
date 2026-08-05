import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Public } from '../tenant/tenant.decorator';
import { GatewayAuthGuard } from '../gateway/gateway-auth.guard';
import type { GatewayIdentity } from '../gateway/gateway-key.service';
import { AppService } from './app.service';
import { AppReadinessService } from './app-readiness.service';
import { ProjectEventsService } from './project-events.service';

type GatewayRequest = FastifyRequest & { gatewayContext: GatewayIdentity };

interface AppStateDto {
  serving?: boolean;
  live?: boolean;
  name?: string | null;
  description?: string | null;
  externalServices?: string[];
}

function parseExternalServices(value: AppStateDto['externalServices']): string[] {
  if (!Array.isArray(value)) return [];
  const services = value
    .filter((service): service is string => typeof service === 'string')
    .map((service) => service.trim())
    .filter((service) => service.length > 0);
  return Array.from(new Set(services));
}

@Public()
@UseGuards(GatewayAuthGuard)
@Controller('gateway/app')
export class AppAgentController {
  constructor(
    private readonly appService: AppService,
    private readonly appReadiness: AppReadinessService,
    private readonly projectEventsService: ProjectEventsService
  ) {}

  @Post('state')
  async state(@Body() dto: AppStateDto, @Req() req: GatewayRequest): Promise<{ ok: true }> {
    const { projectId, projectEnvironmentId } = req.gatewayContext;
    const key = projectEnvironmentId ?? projectId;
    const serving = dto.serving === true;
    const live = dto.live === true;

    if (live) {
      const name = typeof dto.name === 'string' ? dto.name : null;
      const description = typeof dto.description === 'string' ? dto.description : null;
      const externalServices = parseExternalServices(dto.externalServices);
      const changed = await this.appService.upsertProjectApp(key, projectId, { name, description, externalServices });
      this.appReadiness.markServing(key);
      if (changed) {
        await this.projectEventsService.publish(projectId);
      }
    } else if (serving) {
      this.appReadiness.markServing(key);
    } else {
      this.appReadiness.markDown(key);
    }

    return { ok: true };
  }
}

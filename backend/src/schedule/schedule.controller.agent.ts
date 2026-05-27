import { Controller, Post, Get, Delete, Body, Param, Req, UseGuards, BadRequestException } from "@nestjs/common"
import { FastifyRequest } from "fastify"
import { Public } from "../tenant/tenant.decorator"
import { GatewayAuthGuard } from "../gateway/gateway-auth.guard"
import { ScheduleService } from "./schedule.service"
import type { GatewayIdentity } from "../gateway/gateway-key.service"
import type { CreateScheduleDto } from "./schedule.types"

type GatewayRequest = FastifyRequest & { gatewayContext: GatewayIdentity }

@Public()
@UseGuards(GatewayAuthGuard)
@Controller("gateway/schedules")
export class ScheduleAgentController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  async upsert(@Body() dto: CreateScheduleDto, @Req() req: GatewayRequest) {
    const { projectId, tenantId } = req.gatewayContext

    if (!dto.name || !dto.cronPattern || !dto.targetPath) {
      throw new BadRequestException("Missing required fields: name, cronPattern, targetPath")
    }

    if (!tenantId) {
      throw new BadRequestException("Schedules require a claimed project")
    }

    return this.scheduleService.upsert(projectId, tenantId, dto)
  }

  @Get()
  async list(@Req() req: GatewayRequest) {
    return this.scheduleService.findByProject(req.gatewayContext.projectId)
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: GatewayRequest) {
    await this.scheduleService.removeById(req.gatewayContext.projectId, id)
    return { success: true }
  }
}

import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common"
import type { FastifyReply, FastifyRequest } from "fastify"
import { PublishService } from "./publish.service"
import { PublishDto } from "./publish.types"
import { ProjectService } from "../project/project.service"
import { ProjectEventsService } from "../project/project-events.service"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { RequirePermission } from "../permission/permission.guard"
import { Perms } from "../permission/permission.constants"

@Controller("projects/:projectId/publish")
export class PublishController {
  constructor(
    private readonly publishService: PublishService,
    private readonly projectEventsService: ProjectEventsService,
    private readonly projectService: ProjectService,
  ) {}

  @Get("targets")
  @RequirePermission(Perms.publishProject)
  async targets(@Param("projectId") projectId: string, @CurrentTenant() tenant: TenantContext) {
    await this.gate(projectId, tenant.tenantId)
    return this.publishService.listTargets(projectId, tenant.tenantId)
  }

  @Get("form")
  @RequirePermission(Perms.publishProject)
  async form(
    @Param("projectId") projectId: string,
    @Query("environmentId") environmentId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    await this.gate(projectId, tenant.tenantId)
    return this.publishService.getForm(projectId, tenant.tenantId, environmentId)
  }

  @Post()
  @RequirePermission(Perms.publishProject)
  async publish(
    @Param("projectId") projectId: string,
    @Body() dto: PublishDto,
    @CurrentTenant() tenant: TenantContext,
  ) {
    await this.gate(projectId, tenant.tenantId)
    return this.publishService.publish(projectId, tenant.tenantId, dto)
  }

  @Get("environments/:environmentId/job")
  @RequirePermission(Perms.publishProject)
  async latestJob(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @CurrentTenant() tenant: TenantContext,
  ) {
    await this.gate(projectId, tenant.tenantId)
    return this.publishService.getLatestJob(projectId, environmentId)
  }

  @Get("environments/:environmentId/job/stream")
  @RequirePermission(Perms.publishProject)
  async jobStream(
    @Param("projectId") projectId: string,
    @Param("environmentId") environmentId: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.gate(projectId, tenant.tenantId)

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "x-no-compression": "1",
    })

    let closed = false
    let lastSerialized: string | null = null
    let unsubscribe = () => {}
    const heartbeat = setInterval(() => {
      if (!closed) reply.raw.write(": ping\n\n")
    }, 25000)
    const close = () => {
      closed = true
      clearInterval(heartbeat)
      unsubscribe()
    }

    const send = async () => {
      if (closed) return
      const job = await this.publishService.getLatestJob(projectId, environmentId)
      if (closed || !job) return
      const serialized = JSON.stringify(job)
      if (serialized === lastSerialized) return
      lastSerialized = serialized
      reply.raw.write(`data: ${serialized}\n\n`)
    }

    unsubscribe = this.projectEventsService.subscribe(projectId, () => {
      void send()
    })

    req.raw.on("close", close)
    await send()
  }

  private async gate(projectId: string, tenantId: string): Promise<void> {
    await this.projectService.findOne(projectId, tenantId)
  }
}

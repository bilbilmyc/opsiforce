import { Controller, All, Param, Req, Res, NotFoundException } from "@nestjs/common"
import { FastifyReply, FastifyRequest } from "fastify"
import { Readable } from "stream"
import { ProxyService } from "./proxy.service"
import { ProjectService } from "../project/project.service"
import { CurrentTenant, type TenantContext } from "../tenant/tenant.decorator"
import { BAD_GATEWAY_RESPONSE_BODY, isK8sPodError, RESTARTING_RESPONSE_BODY } from "./proxy.shared"

@Controller("proxy")
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly projectService: ProjectService,
  ) {}

  @All(":projectId/*")
  async proxyRequest(
    @Param("projectId") projectId: string,
    @CurrentTenant() tenant: TenantContext,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const ensured = await this.projectService.ensureProjectForTenant(
      projectId,
      tenant.tenantId,
      "agent",
    )

    if (ensured.state === "starting") {
      this.sendRestartingResponse(reply)
      return
    }

    try {
      const upstream = await this.proxyService.resolveUpstream(projectId, tenant.tenantId)
      const targetPath = req.url.replace(`/api/proxy/${projectId}`, "") || "/"
      const targetUrl = `${upstream}${targetPath}`

      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(req.headers)) {
        if (key === "host" || key === "connection" || key === "content-length" || key === "transfer-encoding") continue
        if (typeof value === "string") headers[key] = value
      }

      let body: BodyInit | undefined
      if (!["GET", "HEAD"].includes(req.method) && req.body !== undefined) {
        body = typeof req.body === "string" ? req.body : JSON.stringify(req.body)
      }

      const response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
      })

      if (response.status >= 400) {
        const text = await response.text()
        if (isK8sPodError(text)) {
          if (await this.shouldRestartProject(projectId, tenant.tenantId)) {
            this.sendRestartingResponse(reply)
            return
          }

          this.sendBadGatewayResponse(reply)
          return
        }
        reply.status(response.status)
        for (const [key, value] of response.headers.entries()) {
          if (key === "transfer-encoding") continue
          reply.header(key, value)
        }
        reply.send(text)
        return
      }

      reply.status(response.status)
      for (const [key, value] of response.headers.entries()) {
        if (key === "transfer-encoding") continue
        reply.header(key, value)
      }

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as import("stream/web").ReadableStream)
        reply.send(nodeStream)
      } else {
        reply.send("")
      }
    } catch (err) {
      if (err instanceof NotFoundException) throw err

      if (await this.shouldRestartProject(projectId, tenant.tenantId)) {
        this.sendRestartingResponse(reply)
        return
      }

      this.sendBadGatewayResponse(reply)
    }
  }

  private sendRestartingResponse(reply: FastifyReply) {
    reply.status(503).header("content-type", "application/json").send(RESTARTING_RESPONSE_BODY)
  }

  private sendBadGatewayResponse(reply: FastifyReply) {
    reply.status(502).header("content-type", "application/json").send(BAD_GATEWAY_RESPONSE_BODY)
  }

  private async shouldRestartProject(projectId: string, tenantId: string): Promise<boolean> {
    try {
      const ensured = await this.projectService.ensureProjectForTenant(projectId, tenantId, "agent")
      return ensured.state === "starting"
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      return false
    }
  }
}

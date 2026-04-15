import { Controller, All, Param, Req, Res, ForbiddenException, NotFoundException } from "@nestjs/common"
import { FastifyReply, FastifyRequest } from "fastify"
import { Readable } from "stream"
import { ProxyService } from "./proxy.service"
import { ProjectService } from "../project/project.service"
import { TenantService } from "../tenant/tenant.service"
import { BAD_GATEWAY_RESPONSE_BODY, DISABLED_RESPONSE_BODY, isK8sPodError, RESTARTING_RESPONSE_BODY } from "./proxy.shared"

@Controller("proxy")
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly projectService: ProjectService,
    private readonly tenantService: TenantService,
  ) {}

  @All(":projectId/*")
  async proxyRequest(
    @Param("projectId") projectId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const project = await this.projectService.findOneById(projectId)
    await this.assertProjectTenantAccess(project.tenantId, req)
    const ensured = await this.projectService.ensureProjectAccess(project, "agent")

    if (ensured.state === "disabled") {
      this.sendDisabledResponse(reply)
      return
    }

    if (ensured.state === "starting") {
      this.sendRestartingResponse(reply)
      return
    }

    try {
      const upstream = await this.proxyService.resolveUpstream(projectId, project.tenantId)
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
          if (await this.shouldRestartProject(projectId, project.tenantId)) {
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

      if (await this.shouldRestartProject(projectId, project.tenantId)) {
        this.sendRestartingResponse(reply)
        return
      }

      this.sendBadGatewayResponse(reply)
    }
  }

  private sendRestartingResponse(reply: FastifyReply) {
    reply.status(503).header("content-type", "application/json").send(RESTARTING_RESPONSE_BODY)
  }

  private sendDisabledResponse(reply: FastifyReply) {
    reply.status(423).header("content-type", "application/json").send(DISABLED_RESPONSE_BODY)
  }

  private sendBadGatewayResponse(reply: FastifyReply) {
    reply.status(502).header("content-type", "application/json").send(BAD_GATEWAY_RESPONSE_BODY)
  }

  private async shouldRestartProject(projectId: string, tenantId: string): Promise<boolean> {
    try {
      return await this.projectService.handleProxyFailure(projectId, tenantId)
    } catch (err) {
      if (err instanceof NotFoundException) throw err
      return false
    }
  }

  private async assertProjectTenantAccess(tenantId: string, req: FastifyRequest): Promise<void> {
    const groupsHeader = req.headers["x-forwarded-groups"] as string | undefined
    if (!groupsHeader) throw new ForbiddenException("No tenant groups found")

    const tenantNames = this.tenantService.parseTenantGroups(groupsHeader)
    if (tenantNames.length === 0) throw new ForbiddenException("No opsiforce tenants assigned")

    const tenant = await this.tenantService.getTenantById(tenantId)
    if (!tenant || !tenantNames.includes(tenant.name)) {
      throw new ForbiddenException("No access to this project")
    }
  }
}

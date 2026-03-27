import { Controller, All, Param, Req, Res, NotFoundException } from "@nestjs/common"
import { FastifyReply, FastifyRequest } from "fastify"
import { Readable } from "stream"
import { ProxyService } from "./proxy.service"
import { ProjectService } from "../project/project.service"

@Controller("proxy")
export class ProxyController {
  constructor(
    private readonly proxyService: ProxyService,
    private readonly projectService: ProjectService,
  ) {}

  @All(":projectId/*")
  async proxyRequest(
    @Param("projectId") projectId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.projectService.touchActivity(projectId).catch(() => {})

    try {
      const upstream = await this.proxyService.resolveUpstream(projectId)
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
        if (this.isK8sPodError(text)) {
          await this.projectService.reassignPod(projectId).catch(() => {})
          reply.status(503).header("content-type", "application/json")
            .send(JSON.stringify({ error: "Pod is restarting, please retry" }))
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

      await this.projectService.reassignPod(projectId).catch(() => {})
      reply.status(503).header("content-type", "application/json")
        .send(JSON.stringify({ error: "Pod is restarting, please retry" }))
    }
  }

  private isK8sPodError(body: string): boolean {
    try {
      const parsed = JSON.parse(body)
      return parsed.kind === "Status" && parsed.status === "Failure"
    } catch {
      return false
    }
  }
}

import { Controller, All, Param, Req, Res } from "@nestjs/common"
import { FastifyReply, FastifyRequest } from "fastify"
import { Readable } from "stream"
import { ProxyService } from "./proxy.service"

@Controller("proxy")
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All(":projectId/*")
  async proxyRequest(
    @Param("projectId") projectId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
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
  }
}

import { Injectable, NestMiddleware, Logger } from "@nestjs/common"
import { FastifyRequest, FastifyReply } from "fastify"
import { ProxyService } from "./proxy.service"
import { ProjectService } from "../project/project.service"

@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ProxyMiddleware.name)

  constructor(
    private readonly proxyService: ProxyService,
    private readonly projectService: ProjectService,
  ) {}

  async use(req: FastifyRequest["raw"], res: FastifyReply["raw"], next: () => void) {
    const url = req.url || ""
    const match = url.match(/^\/proxy\/([^/]+)/)
    if (!match) {
      next()
      return
    }

    const projectId = match[1]

    try {
      await this.projectService.touchActivity(projectId)
    } catch {
      // noop
    }

    next()
  }
}

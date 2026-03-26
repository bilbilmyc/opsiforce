import { Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { projects } from "../../db/schema"

@Injectable()
export class ProxyService {
  private readonly agentPort: number
  private readonly k8sApiProxyUrl: string
  private readonly k8sNamespace: string

  constructor(private readonly configService: ConfigService) {
    this.agentPort = this.configService.getOrThrow<number>("agentPort")
    this.k8sApiProxyUrl = this.configService.getOrThrow<string>("k8sApiProxyUrl")
    this.k8sNamespace = this.configService.getOrThrow<string>("k8sNamespace")
  }

  async resolveUpstream(projectId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)
    if (project.status !== "active") throw new NotFoundException(`Project ${projectId} is not active`)

    if (this.k8sApiProxyUrl && project.podName) {
      return `${this.k8sApiProxyUrl}/api/v1/namespaces/${this.k8sNamespace}/pods/${project.podName}:${this.agentPort}/proxy`
    }

    if (!project.podIp) throw new NotFoundException(`Project ${projectId} has no assigned pod`)
    return `http://${project.podIp}:${this.agentPort}`
  }
}

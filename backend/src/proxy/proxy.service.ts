import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq, and, like } from "drizzle-orm"
import { db } from "../../db"
import { projects } from "../../db/schema"

@Injectable()
export class ProxyService {
  private readonly agentPort: number
  private readonly appPort: number
  private readonly vscodePort: number
  private readonly dbViewerPort: number
  private readonly k8sApiProxyUrl: string
  private readonly k8sNamespace: string

  constructor(private readonly configService: ConfigService) {
    this.agentPort = this.configService.getOrThrow<number>("agentPort")
    this.appPort = this.configService.getOrThrow<number>("appPort")
    this.vscodePort = this.configService.getOrThrow<number>("vscodePort")
    this.dbViewerPort = this.configService.getOrThrow<number>("dbViewerPort")
    this.k8sApiProxyUrl = this.configService.getOrThrow<string>("k8sApiProxyUrl")
    this.k8sNamespace = this.configService.getOrThrow<string>("k8sNamespace")
  }

  async resolveUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.agentPort)
  }

  async resolveAppUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.appPort)
  }

  async resolveVscodeUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.vscodePort)
  }

  async resolveVscodeUpstreamByProjectId(projectId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    return this.upstreamFromProject(project, this.vscodePort)
  }

  async resolveDbUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.dbViewerPort)
  }

  async resolveDbUpstreamByProjectId(projectId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    return this.upstreamFromProject(project, this.dbViewerPort)
  }

  async getPodNameByProjectId(projectId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project?.podName) throw new NotFoundException(`Project ${projectId} has no pod`)

    return project.podName
  }

  async resolveAppUpstreamByProjectId(projectId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    return this.upstreamFromProject(project, this.appPort)
  }

  async resolveAppUpstreamByShortId(shortId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(like(projects.id, `${shortId}%`))

    if (!project) throw new NotFoundException(`Project matching ${shortId} not found`)

    return this.upstreamFromProject(project, this.appPort)
  }

  private upstreamFromProject(project: { podName: string | null; podIp: string | null; id: string }, port: number): string {
    if (this.k8sApiProxyUrl && project.podName) {
      return `${this.k8sApiProxyUrl}/api/v1/namespaces/${this.k8sNamespace}/pods/${project.podName}:${port}/proxy`
    }

    if (project.podIp) {
      return `http://${project.podIp}:${port}`
    }

    throw new ServiceUnavailableException(`Project ${project.id} has no active pod`)
  }

  private async resolveUpstreamForPort(projectId: string, tenantId: string, port: number): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    if (this.k8sApiProxyUrl && project.podName) {
      return `${this.k8sApiProxyUrl}/api/v1/namespaces/${this.k8sNamespace}/pods/${project.podName}:${port}/proxy`
    }

    if (project.podIp) {
      return `http://${project.podIp}:${port}`
    }

    throw new ServiceUnavailableException(`Project ${projectId} has no active pod`)
  }
}

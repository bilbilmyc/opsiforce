import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq, and, like } from "drizzle-orm"
import { db } from "../../db"
import { projects } from "../../db/schema"
import { PodService } from "../pod/pod.service"

interface ProjectUpstreamRef {
  id: string
  podIp: string | null
}

@Injectable()
export class ProxyService {
  private readonly agentPort: number
  private readonly appPort: number
  private readonly vscodePort: number
  private readonly dbViewerPort: number

  constructor(
    private readonly configService: ConfigService,
    private readonly podService: PodService,
  ) {
    this.agentPort = this.configService.getOrThrow<number>("agentPort")
    this.appPort = this.configService.getOrThrow<number>("appPort")
    this.vscodePort = this.configService.getOrThrow<number>("vscodePort")
    this.dbViewerPort = this.configService.getOrThrow<number>("dbViewerPort")
  }

  async resolveUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.agentPort)
  }

  resolveUpstreamForProject(project: ProjectUpstreamRef): string {
    return this.upstreamFromProject(project, this.agentPort)
  }

  async resolveAppUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.appPort)
  }

  resolveAppUpstreamForProject(project: ProjectUpstreamRef): string {
    return this.upstreamFromProject(project, this.appPort)
  }

  async resolveVscodeUpstream(projectId: string, tenantId: string): Promise<string> {
    return this.resolveUpstreamForPort(projectId, tenantId, this.vscodePort)
  }

  resolveVscodeUpstreamForProject(project: ProjectUpstreamRef): string {
    return this.upstreamFromProject(project, this.vscodePort)
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

  resolveDbUpstreamForProject(project: ProjectUpstreamRef): string {
    return this.upstreamFromProject(project, this.dbViewerPort)
  }

  async resolveDbUpstreamByProjectId(projectId: string): Promise<string> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    return this.upstreamFromProject(project, this.dbViewerPort)
  }

  getAssignedPodName(projectId: string): string {
    return this.podService.assignedPodName(projectId)
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

  private upstreamFromProject(project: ProjectUpstreamRef, port: number): string {
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

    if (project.podIp) {
      return `http://${project.podIp}:${port}`
    }

    throw new ServiceUnavailableException(`Project ${projectId} has no active pod`)
  }
}

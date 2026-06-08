import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { projectEnvironments } from "../../db/schema"
import { PodService } from "../pod/pod.service"

interface EnvironmentUpstreamRef {
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

  resolveUpstreamForProject(env: EnvironmentUpstreamRef): string {
    return this.upstreamFromEnvironment(env, this.agentPort)
  }

  resolveAppUpstreamForProject(env: EnvironmentUpstreamRef): string {
    return this.upstreamFromEnvironment(env, this.appPort)
  }

  resolveVscodeUpstreamForProject(env: EnvironmentUpstreamRef): string {
    return this.upstreamFromEnvironment(env, this.vscodePort)
  }

  resolveDbUpstreamForProject(env: EnvironmentUpstreamRef): string {
    return this.upstreamFromEnvironment(env, this.dbViewerPort)
  }

  getAssignedPodName(environmentId: string): string {
    return this.podService.assignedPodName(environmentId)
  }

  async resolveAppUpstreamByEnvironmentId(environmentId: string): Promise<string> {
    const [env] = await db
      .select({ id: projectEnvironments.id, podIp: projectEnvironments.podIp })
      .from(projectEnvironments)
      .where(eq(projectEnvironments.id, environmentId))

    if (!env) throw new NotFoundException(`Project environment ${environmentId} not found`)

    return this.upstreamFromEnvironment(env, this.appPort)
  }

  private upstreamFromEnvironment(env: EnvironmentUpstreamRef, port: number): string {
    if (env.podIp) {
      return `http://${env.podIp}:${port}`
    }

    throw new ServiceUnavailableException(`Project environment ${env.id} has no active pod`)
  }
}

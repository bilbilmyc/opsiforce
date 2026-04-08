import { Injectable, OnModuleDestroy } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { projectSettings } from "../../db/schema"

const AGENT_KEY_PREFIX = "opsiforce:timeout:"
const APP_KEY_PREFIX = "opsiforce:app-timeout:"

@Injectable()
export class TimeoutService implements OnModuleDestroy {
  private readonly redis: Redis
  readonly redisUrl: string
  readonly dbNumber: number

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.getOrThrow<string>("redisUrl")
    this.redis = new Redis(this.redisUrl)
    this.dbNumber = this.parseDbNumber(this.redisUrl)
  }

  async onModuleDestroy() {
    await this.redis.quit()
  }

  private async getProjectTtl(projectId: string): Promise<{ agentTtl: number; appTtl: number }> {
    const [project] = await db
      .select({
        timeoutIdle: projectSettings.timeoutIdle,
        appTimeoutIdle: projectSettings.appTimeoutIdle,
      })
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))

    if (!project) {
      throw new Error(`Project ${projectId} not found`)
    }

    return {
      agentTtl: Math.ceil(project.timeoutIdle / 1000),
      appTtl: Math.ceil(project.appTimeoutIdle / 1000),
    }
  }

  async touch(projectId: string): Promise<void> {
    const { agentTtl } = await this.getProjectTtl(projectId)
    await this.redis.setex(
      `${AGENT_KEY_PREFIX}${projectId}`,
      agentTtl,
      Date.now().toString(),
    )
  }

  async touchApp(projectId: string): Promise<void> {
    const { appTtl } = await this.getProjectTtl(projectId)
    await this.redis.setex(
      `${APP_KEY_PREFIX}${projectId}`,
      appTtl,
      Date.now().toString(),
    )
  }

  async isFullyExpired(projectId: string): Promise<boolean> {
    const agentTtl = await this.redis.ttl(`${AGENT_KEY_PREFIX}${projectId}`)
    const appTtl = await this.redis.ttl(`${APP_KEY_PREFIX}${projectId}`)
    return agentTtl <= 0 && appTtl <= 0
  }

  async clear(projectId: string): Promise<void> {
    await this.redis.del(
      `${AGENT_KEY_PREFIX}${projectId}`,
      `${APP_KEY_PREFIX}${projectId}`,
    )
  }

  parseExpiredKey(key: string): { projectId: string; type: "agent" | "app" } | null {
    const agentMatch = key.match(/^opsiforce:timeout:(.+)/)
    if (agentMatch) return { projectId: agentMatch[1], type: "agent" }
    const appMatch = key.match(/^opsiforce:app-timeout:(.+)/)
    if (appMatch) return { projectId: appMatch[1], type: "app" }
    return null
  }

  private parseDbNumber(url: string): number {
    const match = url.match(/\/(\d+)$/)
    return match ? parseInt(match[1]) : 0
  }
}

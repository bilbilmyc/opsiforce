import { Injectable, OnModuleDestroy } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { projects } from "../../db/schema"

const AGENT_KEY_PREFIX = "opsiforce:timeout:"
const APP_KEY_PREFIX = "opsiforce:app-timeout:"

@Injectable()
export class TimeoutService implements OnModuleDestroy {
  private static readonly DEFAULT_AGENT_TIMEOUT_MINUTES = 30
  private static readonly DEFAULT_APP_TIMEOUT_MINUTES = 10080

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
      .select({ timeoutIdleMinutes: projects.timeoutIdleMinutes, appTimeoutIdleMinutes: projects.appTimeoutIdleMinutes })
      .from(projects)
      .where(eq(projects.id, projectId))

    return {
      agentTtl: (project?.timeoutIdleMinutes ?? TimeoutService.DEFAULT_AGENT_TIMEOUT_MINUTES) * 60,
      appTtl: (project?.appTimeoutIdleMinutes ?? TimeoutService.DEFAULT_APP_TIMEOUT_MINUTES) * 60,
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

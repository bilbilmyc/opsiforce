import { Injectable, OnModuleDestroy } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { projectEnvironments, projectSettings } from "../../db/schema"

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

  private async getEnvironmentTtl(envId: string): Promise<{ agentTtl: number; appTtl: number }> {
    const [settings] = await db
      .select({
        timeoutIdle: projectSettings.timeoutIdle,
        appTimeoutIdle: projectSettings.appTimeoutIdle,
      })
      .from(projectEnvironments)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projectEnvironments.projectId))
      .where(eq(projectEnvironments.id, envId))

    if (!settings) {
      throw new Error(`Project environment ${envId} not found`)
    }

    return {
      agentTtl: Math.ceil(settings.timeoutIdle / 1000),
      appTtl: Math.ceil(settings.appTimeoutIdle / 1000),
    }
  }

  async touch(envId: string): Promise<void> {
    const { agentTtl } = await this.getEnvironmentTtl(envId)
    await this.redis.setex(
      `${AGENT_KEY_PREFIX}${envId}`,
      agentTtl,
      Date.now().toString(),
    )
  }

  async touchApp(envId: string): Promise<void> {
    const { appTtl } = await this.getEnvironmentTtl(envId)
    await this.redis.setex(
      `${APP_KEY_PREFIX}${envId}`,
      appTtl,
      Date.now().toString(),
    )
  }

  async isFullyExpired(envId: string): Promise<boolean> {
    const agentTtl = await this.redis.ttl(`${AGENT_KEY_PREFIX}${envId}`)
    const appTtl = await this.redis.ttl(`${APP_KEY_PREFIX}${envId}`)
    return agentTtl <= 0 && appTtl <= 0
  }

  async clear(envId: string): Promise<void> {
    await this.redis.del(
      `${AGENT_KEY_PREFIX}${envId}`,
      `${APP_KEY_PREFIX}${envId}`,
    )
  }

  parseExpiredKey(key: string): { envId: string; type: "agent" | "app" } | null {
    const agentMatch = key.match(/^opsiforce:timeout:(.+)/)
    if (agentMatch) return { envId: agentMatch[1], type: "agent" }
    const appMatch = key.match(/^opsiforce:app-timeout:(.+)/)
    if (appMatch) return { envId: appMatch[1], type: "app" }
    return null
  }

  private parseDbNumber(url: string): number {
    const match = url.match(/\/(\d+)$/)
    return match ? parseInt(match[1]) : 0
  }
}

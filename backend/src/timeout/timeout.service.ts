import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"

const TIMEOUT_KEY_PREFIX = "opsiforce:timeout:"

@Injectable()
export class TimeoutService implements OnModuleDestroy {
  private readonly logger = new Logger(TimeoutService.name)
  private readonly redis: Redis
  private readonly ttlSeconds: number
  readonly redisUrl: string
  readonly dbNumber: number

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.getOrThrow<string>("redisUrl")
    this.redis = new Redis(this.redisUrl)
    this.ttlSeconds = this.configService.getOrThrow<number>("timeoutIdleMinutes") * 60
    this.dbNumber = this.parseDbNumber(this.redisUrl)
  }

  async onModuleDestroy() {
    await this.redis.quit()
  }

  async enableKeyspaceNotifications(): Promise<void> {
    await this.redis.config("SET", "notify-keyspace-events", "Ex")
    this.logger.log("Redis keyspace notifications enabled (notify-keyspace-events Ex)")
  }

  async touch(projectId: string): Promise<void> {
    await this.redis.setex(
      `${TIMEOUT_KEY_PREFIX}${projectId}`,
      this.ttlSeconds,
      Date.now().toString(),
    )
  }

  async isExpired(projectId: string): Promise<boolean> {
    const ttl = await this.redis.ttl(`${TIMEOUT_KEY_PREFIX}${projectId}`)
    return ttl <= 0
  }

  async clear(projectId: string): Promise<void> {
    await this.redis.del(`${TIMEOUT_KEY_PREFIX}${projectId}`)
  }

  parseExpiredKey(key: string): string | null {
    const match = key.match(/^opsiforce:timeout:(.+)/)
    return match ? match[1] : null
  }

  private parseDbNumber(url: string): number {
    const match = url.match(/\/(\d+)$/)
    return match ? parseInt(match[1]) : 0
  }
}

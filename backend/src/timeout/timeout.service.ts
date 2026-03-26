import { Injectable, OnModuleDestroy } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import Redis from "ioredis"

const TIMEOUT_KEY_PREFIX = "opsiforce:timeout:"

@Injectable()
export class TimeoutService implements OnModuleDestroy {
  private readonly redis: Redis
  private readonly ttlSeconds: number

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis(this.configService.getOrThrow<string>("redisUrl"))
    this.ttlSeconds = this.configService.getOrThrow<number>("timeoutIdleMinutes") * 60
  }

  async onModuleDestroy() {
    await this.redis.quit()
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

  async getActiveProjectIds(): Promise<string[]> {
    const keys = await this.redis.keys(`${TIMEOUT_KEY_PREFIX}*`)
    return keys.map((key) => key.replace(TIMEOUT_KEY_PREFIX, ""))
  }
}

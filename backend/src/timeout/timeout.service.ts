import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { projectEnvironments, projectSettings } from '../../db/schema';

const AGENT_KEY_PREFIX = 'opsiforce:timeout:';
const APP_KEY_PREFIX = 'opsiforce:app-timeout:';

export interface KeepAliveActivity {
  lastTouchMs: number | null;
  remainingMs: number | null;
}

export interface EnvironmentKeepAlive {
  agent: KeepAliveActivity;
  app: KeepAliveActivity;
}

@Injectable()
export class TimeoutService implements OnModuleDestroy {
  private readonly redis: Redis;
  readonly redisUrl: string;
  readonly dbNumber: number;

  constructor(private readonly configService: ConfigService) {
    this.redisUrl = this.configService.getOrThrow<string>('redisUrl');
    this.redis = new Redis(this.redisUrl);
    this.dbNumber = this.parseDbNumber(this.redisUrl);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private async getEnvironmentTtl(envId: string): Promise<{ agentTtl: number; appTtl: number }> {
    const [settings] = await db
      .select({
        timeoutIdle: projectSettings.timeoutIdle,
        appTimeoutIdle: projectSettings.appTimeoutIdle,
      })
      .from(projectEnvironments)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projectEnvironments.projectId))
      .where(eq(projectEnvironments.id, envId));

    if (!settings) {
      throw new Error(`Project environment ${envId} not found`);
    }

    return {
      agentTtl: Math.ceil(settings.timeoutIdle / 1000),
      appTtl: Math.ceil(settings.appTimeoutIdle / 1000),
    };
  }

  async touch(envId: string): Promise<void> {
    const { agentTtl } = await this.getEnvironmentTtl(envId);
    await this.redis.setex(`${AGENT_KEY_PREFIX}${envId}`, agentTtl, Date.now().toString());
  }

  async touchApp(envId: string): Promise<void> {
    const { appTtl } = await this.getEnvironmentTtl(envId);
    await this.redis.setex(`${APP_KEY_PREFIX}${envId}`, appTtl, Date.now().toString());
  }

  async isFullyExpired(envId: string): Promise<boolean> {
    const agentTtl = await this.redis.ttl(`${AGENT_KEY_PREFIX}${envId}`);
    const appTtl = await this.redis.ttl(`${APP_KEY_PREFIX}${envId}`);
    return agentTtl <= 0 && appTtl <= 0;
  }

  async getKeepAlive(envId: string): Promise<EnvironmentKeepAlive> {
    const batch = await this.getKeepAliveBatch([envId]);
    return batch.get(envId) ?? emptyKeepAlive();
  }

  async getKeepAliveBatch(envIds: string[]): Promise<Map<string, EnvironmentKeepAlive>> {
    const result = new Map<string, EnvironmentKeepAlive>();
    if (envIds.length === 0) return result;

    const pipeline = this.redis.pipeline();
    envIds.forEach((envId) => {
      pipeline.get(`${AGENT_KEY_PREFIX}${envId}`);
      pipeline.pttl(`${AGENT_KEY_PREFIX}${envId}`);
      pipeline.get(`${APP_KEY_PREFIX}${envId}`);
      pipeline.pttl(`${APP_KEY_PREFIX}${envId}`);
    });
    const responses = await pipeline.exec();

    envIds.forEach((envId, index) => {
      const base = index * 4;
      result.set(envId, {
        agent: readActivityFromPipeline(responses, base),
        app: readActivityFromPipeline(responses, base + 2),
      });
    });
    return result;
  }

  async clear(envId: string): Promise<void> {
    await this.redis.del(`${AGENT_KEY_PREFIX}${envId}`, `${APP_KEY_PREFIX}${envId}`);
  }

  parseExpiredKey(key: string): { envId: string; type: 'agent' | 'app' } | null {
    const agentMatch = key.match(/^opsiforce:timeout:(.+)/);
    if (agentMatch) return { envId: agentMatch[1], type: 'agent' };
    const appMatch = key.match(/^opsiforce:app-timeout:(.+)/);
    if (appMatch) return { envId: appMatch[1], type: 'app' };
    return null;
  }

  private parseDbNumber(url: string): number {
    const match = url.match(/\/(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  }
}

function emptyKeepAlive(): EnvironmentKeepAlive {
  return { agent: { lastTouchMs: null, remainingMs: null }, app: { lastTouchMs: null, remainingMs: null } };
}

function readActivityFromPipeline(responses: [Error | null, unknown][] | null, valueIndex: number): KeepAliveActivity {
  if (!responses) return { lastTouchMs: null, remainingMs: null };
  const valueResult = responses[valueIndex];
  const ttlResult = responses[valueIndex + 1];
  const rawPttl = ttlResult && ttlResult[0] === null ? ttlResult[1] : null;
  const pttl = typeof rawPttl === 'number' ? rawPttl : -2;
  const remainingMs = pttl >= 0 ? pttl : null;
  const rawValue = valueResult && valueResult[0] === null ? valueResult[1] : null;
  if (typeof rawValue !== 'string') return { lastTouchMs: null, remainingMs };
  const parsed = Number(rawValue);
  return { lastTouchMs: Number.isFinite(parsed) ? parsed : null, remainingMs };
}

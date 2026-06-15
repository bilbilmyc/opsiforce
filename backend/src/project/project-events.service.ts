import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

type ProjectListener = () => void;

const PROJECT_EVENTS_CHANNEL = 'opsiforce:project-events';

@Injectable()
export class ProjectEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectEventsService.name);
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly listeners = new Map<string, Set<ProjectListener>>();

  constructor(configService: ConfigService) {
    const redisUrl = configService.getOrThrow<string>('redisUrl');
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);
  }

  async onModuleInit(): Promise<void> {
    this.subscriber.on('message', (_channel, projectId) => {
      this.emit(projectId);
    });
    await this.subscriber.subscribe(PROJECT_EVENTS_CHANNEL);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher.quit(), this.subscriber.quit()]).catch((err) => {
      this.logger.warn(`Failed to close project event Redis connections: ${(err as Error).message}`);
    });
  }

  subscribe(projectId: string, listener: ProjectListener): () => void {
    const listeners = this.listeners.get(projectId) ?? new Set<ProjectListener>();
    listeners.add(listener);
    this.listeners.set(projectId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(projectId);
    };
  }

  async publish(projectId: string): Promise<void> {
    await this.publisher.publish(PROJECT_EVENTS_CHANNEL, projectId).catch((err) => {
      this.logger.warn(`Failed to publish project event for ${projectId}: ${(err as Error).message}`);
    });
  }

  private emit(projectId: string): void {
    const listeners = this.listeners.get(projectId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener();
    }
  }
}

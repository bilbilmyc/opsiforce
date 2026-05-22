import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common"
import { and, eq } from "drizzle-orm"
import Redis from "ioredis"
import { db } from "../../db"
import { projects } from "../../db/schema"
import { ProjectStatus } from "../project/project.types"
import { TimeoutService } from "./timeout.service"
import { PodService } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"
import { ProjectEventsService } from "../project/project-events.service"

@Injectable()
export class TimeoutListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimeoutListener.name)
  private subscriber!: Redis
  private sweeping = false

  constructor(
    private readonly timeoutService: TimeoutService,
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
    private readonly projectEventsService: ProjectEventsService,
  ) {}

  async onModuleInit() {
    this.subscriber = new Redis(this.timeoutService.redisUrl)
    const channel = `__keyevent@${this.timeoutService.dbNumber}__:expired`

    this.subscriber.on("message", (_channel, key) => {
      const parsed = this.timeoutService.parseExpiredKey(key)
      if (parsed) {
        this.handleKeyExpiry(parsed.projectId, parsed.type).catch((err) => {
          this.logger.warn(`Failed to handle expiry for project ${parsed.projectId}: ${err.message}`)
        })
      }
    })

    this.subscriber.on("ready", () => {
      this.sweepExpiredProjects().catch((err) => {
        this.logger.warn(`Sweep failed: ${err.message}`)
      })
    })

    await this.subscriber.subscribe(channel)
    this.logger.log(`Subscribed to Redis keyspace notifications on ${channel}`)
  }

  async onModuleDestroy() {
    await this.subscriber?.quit()
  }

  private async handleKeyExpiry(projectId: string, type: "agent" | "app"): Promise<void> {
    const fullyExpired = await this.timeoutService.isFullyExpired(projectId)
    if (!fullyExpired) {
      this.logger.debug(`Project ${projectId} ${type} timeout expired, but other key still active — skipping`)
      return
    }
    await this.suspendProject(projectId)
  }

  private async suspendProject(projectId: string): Promise<void> {
    const [updated] = await db
      .update(projects)
      .set({
        status: ProjectStatus.Suspended,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.status, ProjectStatus.Active)))
      .returning()

    if (!updated) {
      this.logger.debug(`Skipping suspend for project ${projectId}: status changed concurrently`)
      return
    }

    const podName = this.podService.assignedPodName(projectId)
    await this.podService.deletePod(podName).catch((err) => {
      this.logger.warn(`Failed to delete pod ${podName}: ${err.message}`)
    })

    this.logger.log(`Project ${projectId} suspended due to idle timeout`)
    await this.projectEventsService.publish(projectId)
    await this.podPoolService.replenish().catch((err) => {
      this.logger.warn(`Failed to replenish warm pool: ${err.message}`)
    })
  }

  private async sweepExpiredProjects(): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true

    try {
      const activeProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.status, ProjectStatus.Active))

      for (const project of activeProjects) {
        const expired = await this.timeoutService.isFullyExpired(project.id)
        if (expired) {
          await this.suspendProject(project.id)
        }
      }
    } finally {
      this.sweeping = false
    }
  }
}

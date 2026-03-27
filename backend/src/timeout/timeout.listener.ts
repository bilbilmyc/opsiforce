import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common"
import { eq } from "drizzle-orm"
import Redis from "ioredis"
import { db } from "../../db"
import { projects, pods } from "../../db/schema"
import { ProjectStatus } from "../project/project.types"
import { TimeoutService } from "./timeout.service"
import { PodService } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"

@Injectable()
export class TimeoutListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TimeoutListener.name)
  private subscriber!: Redis
  private sweeping = false

  constructor(
    private readonly timeoutService: TimeoutService,
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
  ) {}

  async onModuleInit() {
    this.subscriber = new Redis(this.timeoutService.redisUrl)
    const channel = `__keyevent@${this.timeoutService.dbNumber}__:expired`

    this.subscriber.on("message", (_channel, key) => {
      const projectId = this.timeoutService.parseExpiredKey(key)
      if (projectId) {
        this.suspendProject(projectId).catch((err) => {
          this.logger.warn(`Failed to suspend project ${projectId}: ${err.message}`)
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

  private async suspendProject(projectId: string): Promise<void> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project || project.status !== ProjectStatus.Active) return

    if (project.podName) {
      await db
        .update(pods)
        .set({ status: "terminating", updatedAt: new Date() })
        .where(eq(pods.podName, project.podName))

      await this.podService.deletePod(project.podName).catch((err) => {
        this.logger.warn(`Failed to delete pod ${project.podName}: ${err.message}`)
      })

      await db.delete(pods).where(eq(pods.podName, project.podName))
    }

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Suspended,
        podName: null,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    this.logger.log(`Project ${projectId} suspended due to idle timeout`)
    await this.podPoolService.replenish()
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
        const expired = await this.timeoutService.isExpired(project.id)
        if (expired) {
          await this.suspendProject(project.id)
        }
      }
    } finally {
      this.sweeping = false
    }
  }
}

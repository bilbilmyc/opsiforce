import { Injectable, Logger } from "@nestjs/common"
import { Cron, CronExpression } from "@nestjs/schedule"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { projects, pods } from "../../db/schema"
import { TimeoutService } from "./timeout.service"
import { PodService } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"

@Injectable()
export class TimeoutCron {
  private readonly logger = new Logger(TimeoutCron.name)

  constructor(
    private readonly timeoutService: TimeoutService,
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleIdleTimeouts() {
    const activeProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.status, "active"))

    let expiredCount = 0

    for (const project of activeProjects) {
      const expired = await this.timeoutService.isExpired(project.id)
      if (!expired) continue

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

      await this.timeoutService.clear(project.id)

      await db
        .update(projects)
        .set({
          status: "suspended",
          podName: null,
          podIp: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id))

      this.logger.log(`Project ${project.id} suspended due to idle timeout`)
      expiredCount++
    }

    if (expiredCount > 0) {
      await this.podPoolService.replenish()
    }
  }

  @Cron("0 */30 * * * *")
  async handleOrphanedProjects() {
    const activeProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.status, "active"))

    const existingPods = await this.podService.listPods("app=opsiforce-agent")
    const existingPodNames = new Set(existingPods.map((p) => p.metadata?.name))

    for (const project of activeProjects) {
      if (!project.podName) continue
      if (existingPodNames.has(project.podName)) continue

      this.logger.warn(`Pod ${project.podName} for project ${project.id} no longer exists, suspending`)

      await db.delete(pods).where(eq(pods.podName, project.podName))
      await this.timeoutService.clear(project.id)

      await db
        .update(projects)
        .set({
          status: "suspended",
          podName: null,
          podIp: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, project.id))
    }
  }
}

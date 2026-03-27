import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { pods, projects } from "../../db/schema"
import { PodService } from "./pod.service"
import crypto from "crypto"

@Injectable()
export class PodPoolService implements OnModuleInit {
  private readonly logger = new Logger(PodPoolService.name)
  private readonly warmPoolSize: number

  constructor(
    private readonly podService: PodService,
    private readonly configService: ConfigService,
  ) {
    this.warmPoolSize = this.configService.getOrThrow<number>("warmPoolSize")
  }

  async onModuleInit() {
    await this.cleanupOrphanedPods()
    await this.initialize()
  }

  async initialize(): Promise<void> {
    const warmPods = await db
      .select()
      .from(pods)
      .where(eq(pods.status, "warm"))

    const deficit = this.warmPoolSize - warmPods.length
    if (deficit > 0) {
      await this.replenish(deficit)
    }
  }

  async replenish(count?: number): Promise<void> {
    const warmPods = await db
      .select()
      .from(pods)
      .where(eq(pods.status, "warm"))

    const toCreate = count ?? this.warmPoolSize - warmPods.length
    if (toCreate <= 0) return

    const promises = Array.from({ length: toCreate }, () => this.createWarmPod())
    await Promise.allSettled(promises)
  }

  async claimWarmPod(): Promise<typeof pods.$inferSelect | null> {
    const warmPodRows = await db
      .select()
      .from(pods)
      .where(eq(pods.status, "warm"))
      .limit(1)

    if (warmPodRows.length === 0) return null

    const pod = warmPodRows[0]
    await db
      .update(pods)
      .set({ status: "assigned", updatedAt: new Date() })
      .where(eq(pods.id, pod.id))

    this.replenish()

    return { ...pod, status: "assigned" }
  }

  private async createWarmPod(): Promise<void> {
    const id = crypto.randomUUID()
    const podName = `opsiforce-agent-${id.slice(0, 8)}`

    await this.podService.createWarmPod(podName)

    const podIp = await this.waitForPodIp(podName)

    await db.insert(pods).values({
      id,
      podName,
      status: "warm",
      podIp,
    })
  }

  private async waitForPodIp(podName: string, maxAttempts = 30): Promise<string | undefined> {
    for (let i = 0; i < maxAttempts; i++) {
      const ip = await this.podService.getPodIp(podName)
      if (ip) return ip
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    return undefined
  }

  private async cleanupOrphanedPods(): Promise<void> {
    const k8sPods = await this.podService.listPods("app=opsiforce-agent")
    const dbPodRows = await db.select({ podName: pods.podName }).from(pods)
    const dbProjectRows = await db.select({ podName: projects.podName }).from(projects)

    const knownNames = new Set([
      ...dbPodRows.map((p) => p.podName),
      ...dbProjectRows.map((p) => p.podName).filter(Boolean),
    ])

    for (const k8sPod of k8sPods) {
      const name = k8sPod.metadata?.name
      if (!name || knownNames.has(name)) continue
      this.logger.warn(`Deleting orphaned K8s pod: ${name}`)
      await this.podService.deletePod(name).catch(() => {})
    }
  }
}

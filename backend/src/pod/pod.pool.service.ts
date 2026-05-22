import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import crypto from "crypto"
import { PodService } from "./pod.service"
import { PodCacheService } from "./pod.cache.service"

const WARM_POOL_LABEL_SELECTOR = "app=opsiforce-agent,opsiforce.io/pool=warm"
const STALE_WARM_POD_MS = 5 * 60 * 1000

@Injectable()
export class PodPoolService implements OnModuleInit {
  private readonly logger = new Logger(PodPoolService.name)
  private readonly warmPoolSize: number
  private replenishing = false
  private replenishQueued = false

  constructor(
    private readonly podService: PodService,
    private readonly podCache: PodCacheService,
    private readonly configService: ConfigService,
  ) {
    this.warmPoolSize = this.configService.getOrThrow<number>("warmPoolSize")
    this.podCache.onDelete((_name, pod) => {
      if (pod.metadata?.labels?.["opsiforce.io/pool"] === "warm") {
        void this.replenish().catch((err) => {
          this.logger.warn(`Replenish on warm pod delete event failed: ${(err as Error).message}`)
        })
      }
    })
  }

  async onModuleInit() {
    await this.replenish()
  }

  async replenish(): Promise<void> {
    if (this.replenishing) {
      this.replenishQueued = true
      return
    }
    this.replenishing = true
    try {
      do {
        this.replenishQueued = false
        await this.runReplenish()
      } while (this.replenishQueued)
    } finally {
      this.replenishing = false
    }
  }

  private async runReplenish(): Promise<void> {
    const warmPods = await this.podService.listPods(WARM_POOL_LABEL_SELECTOR)
    const now = Date.now()

    let viable = 0
    const cleanup: Promise<void>[] = []

    warmPods.forEach((pod) => {
      const name = pod.metadata?.name
      if (!name) return

      const ageMs = this.podService.podAgeMs(pod, now)
      const ready = this.podService.isPodReady(pod)
      const failure = this.podService.inspectFailureReason(pod)
      const deleting = !!pod.metadata?.deletionTimestamp

      if (deleting) return

      if (failure === "ImagePullBackOff" || (!ready && ageMs > STALE_WARM_POD_MS)) {
        this.logger.warn(`Cleaning up stuck warm pod ${name} (ready=${ready}, ageMs=${ageMs}, failure=${failure})`)
        cleanup.push(
          this.podService.deletePod(name).catch((err) => {
            this.logger.warn(`Failed to delete stuck warm pod ${name}: ${(err as Error).message}`)
          }),
        )
        return
      }

      viable++
    })

    await Promise.allSettled(cleanup)

    const deficit = this.warmPoolSize - viable
    if (deficit <= 0) return

    const creations = Array.from({ length: deficit }, () => this.createWarmPod())
    await Promise.allSettled(creations)
  }

  async claimWarmPod(): Promise<string | null> {
    const warmPods = await this.podService.listPods(WARM_POOL_LABEL_SELECTOR)

    const candidates = warmPods
      .filter((pod) => !pod.metadata?.deletionTimestamp && this.podService.isPodReady(pod))
      .sort((a, b) => this.podService.podAgeMs(b) - this.podService.podAgeMs(a))

    for (const pod of candidates) {
      const name = pod.metadata?.name
      const resourceVersion = pod.metadata?.resourceVersion
      if (!name || !resourceVersion) continue

      const claimed = await this.podService.deletePodIfMatches(name, resourceVersion)
      if (claimed) {
        void this.replenish().catch((err) => {
          this.logger.warn(`Failed to replenish warm pool after claim: ${err.message}`)
        })
        return name
      }
    }

    return null
  }

  private async createWarmPod(): Promise<void> {
    const id = crypto.randomUUID()
    const podName = `opsiforce-agent-${id.slice(0, 8)}`

    try {
      await this.podService.createWarmPod(podName)
      this.logger.log(`Created warm pod ${podName}`)
    } catch (err) {
      this.logger.warn(`Failed to create warm pod ${podName}: ${(err as Error).message}`)
    }
  }
}

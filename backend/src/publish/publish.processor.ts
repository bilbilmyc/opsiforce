import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Job } from "bullmq"
import path from "node:path"
import { rm } from "node:fs/promises"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { projectPublishJobs, projectSchedules } from "../../db/schema"
import { GitService } from "./git.service"
import { PublishService } from "./publish.service"
import { ProjectEventsService } from "../project/project-events.service"
import { PROJECT_PUBLISH_QUEUE, PublishJobData, PublishStatus } from "./publish.types"
import { ProjectService } from "../project/project.service"
import { ProjectAuthService } from "../project/project-auth.service"
import { ProjectEnvironmentService } from "../project-environment/project-environment.service"
import { GatewayKeyService } from "../gateway/gateway-key.service"
import { ScheduleService } from "../schedule/schedule.service"
import { PodService } from "../pod/pod.service"
import { ProxyService } from "../proxy/proxy.service"
import { ProjectStatus } from "../project/project.types"
import { writeJsonAtomic } from "../common/fs"

const POD_READY_TIMEOUT_MS = 180 * 1000
const APP_READY_TIMEOUT_MS = 10 * 60 * 1000
const APP_POLL_INTERVAL_MS = 4000
const APP_FETCH_TIMEOUT_MS = 4000

@Processor(PROJECT_PUBLISH_QUEUE)
export class PublishProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishProcessor.name)
  private readonly storageMountPath: string

  constructor(
    private readonly configService: ConfigService,
    private readonly git: GitService,
    private readonly publishService: PublishService,
    private readonly projectService: ProjectService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly gatewayKeyService: GatewayKeyService,
    private readonly scheduleService: ScheduleService,
    private readonly podService: PodService,
    private readonly proxyService: ProxyService,
    private readonly projectEvents: ProjectEventsService,
  ) {
    super()
    this.storageMountPath = this.configService.getOrThrow<string>("storageMountPath")
  }

  async process(job: Job<PublishJobData>): Promise<void> {
    const data = job.data
    let prodDir: string | null = null
    let previousSha: string | null = null
    let previousEnvVars: Record<string, string> | null = null

    try {
      await this.setStatus(data.publishJobId, PublishStatus.Committing, { startedAt: new Date() })

      const devEnv = await this.projectEnvironmentService.findDefaultByProjectId(data.projectId)
      const devDir = path.join(this.storageMountPath, devEnv.directory)
      const sha = await this.git.commitWorkingTree(devDir, `Publish ${data.environmentId}`)
      await this.setStatus(data.publishJobId, PublishStatus.Committing, { commitSha: sha })

      const prodEnv = await this.projectEnvironmentService.findById(data.projectEnvironmentId)
      prodDir = path.join(this.storageMountPath, prodEnv.directory)
      previousSha = prodEnv.deployedCommitSha

      await this.setStatus(data.publishJobId, PublishStatus.Swapping, { previousCommitSha: previousSha })

      if (data.isFirstPublish) {
        await rm(prodDir, { recursive: true, force: true })
        await this.git.cloneLocal(devDir, prodDir)
        await this.git.resetHard(prodDir, sha)
        await this.gatewayKeyService.createKey(data.projectId, data.projectEnvironmentId, data.tenantId)
      } else {
        await this.git.fetchOrigin(prodDir)
        await this.git.resetHard(prodDir, sha)
        previousEnvVars = await this.publishService.readEnvFile(prodEnv.directory)
      }

      await this.writeEnvFile(prodEnv.directory, data.variables, data.isFirstPublish)

      if (data.isFirstPublish && devEnv.authMode !== "public") {
        const makaraFallbackTenantName =
          devEnv.authMode === "makara"
            ? await this.projectService.findMakaraTenantName(data.tenantId)
            : undefined
        await this.projectAuthService.inheritAuth(devEnv.id, data.projectEnvironmentId, makaraFallbackTenantName)
      }

      await this.setStatus(data.publishJobId, PublishStatus.Building)
      if (data.isFirstPublish) {
        await this.projectEnvironmentService.patch(
          data.projectEnvironmentId,
          { status: ProjectStatus.Starting, podIp: null },
          ProjectStatus.Publishing,
        )
        await this.projectService.requestStartupForId(data.projectEnvironmentId)
      } else {
        await this.projectService.reassignPodById(data.projectEnvironmentId)
      }

      const podName = this.podService.assignedPodName(data.projectEnvironmentId)
      const podIp = await this.podService.waitForReady(podName, POD_READY_TIMEOUT_MS)

      await this.setStatus(data.publishJobId, PublishStatus.Migrating)
      const appReady = await this.waitForAppReady(data.projectEnvironmentId, podIp, APP_READY_TIMEOUT_MS)
      if (!appReady) {
        throw new Error("Production app did not become ready within the deploy window")
      }

      try {
        await this.reconcileSchedules(data.projectId, data.projectEnvironmentId, data.tenantId, data.scheduleIds)
      } catch (scheduleErr) {
        this.logger.warn(
          `Schedule reconcile for ${data.projectEnvironmentId} failed after a healthy publish: ${(scheduleErr as Error).message}`,
        )
      }

      await this.projectEnvironmentService.patch(data.projectEnvironmentId, { deployedCommitSha: sha })
      await this.setStatus(data.publishJobId, PublishStatus.Done, { completedAt: new Date() })
      this.logger.log(`Published ${data.projectId} to environment ${data.environmentId} (${data.projectEnvironmentId})`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn(`Publish ${data.publishJobId} failed: ${message}`)

      if (!data.isFirstPublish && prodDir && previousSha) {
        try {
          await this.git.resetHard(prodDir, previousSha)
          if (previousEnvVars) {
            await this.restoreEnvFile(prodDir, previousEnvVars)
          }
          await this.projectService.reassignPodById(data.projectEnvironmentId)
        } catch (rollbackErr) {
          this.logger.warn(
            `Rollback of ${data.projectEnvironmentId} to ${previousSha} failed: ${(rollbackErr as Error).message}`,
          )
        }
      } else if (data.isFirstPublish) {
        await this.projectEnvironmentService
          .patch(data.projectEnvironmentId, { status: ProjectStatus.Failed, podIp: null })
          .catch((patchErr) => {
            this.logger.warn(
              `Failed to mark environment ${data.projectEnvironmentId} as failed: ${(patchErr as Error).message}`,
            )
          })
      }

      await this.setStatus(data.publishJobId, PublishStatus.Failed, { error: message, completedAt: new Date() })
    }
  }

  private async reconcileSchedules(
    projectId: string,
    projectEnvironmentId: string,
    tenantId: string,
    scheduleIds: string[],
  ): Promise<void> {
    const devSchedules =
      scheduleIds.length === 0
        ? []
        : await db
            .select()
            .from(projectSchedules)
            .where(
              and(
                eq(
                  projectSchedules.projectEnvironmentId,
                  this.projectEnvironmentService.defaultEnvironmentId(projectId),
                ),
                inArray(projectSchedules.id, scheduleIds),
              ),
            )

    for (const schedule of devSchedules) {
      const headers = isStringRecord(schedule.headers) ? schedule.headers : undefined
      await this.scheduleService.upsert(projectId, projectEnvironmentId, tenantId, {
        name: schedule.name,
        cronPattern: schedule.cronPattern,
        targetPath: schedule.targetPath,
        method: schedule.method,
        body: schedule.body ?? undefined,
        headers,
      })
    }

    const desiredNames = new Set(devSchedules.map((schedule) => schedule.name))
    const existing = await this.scheduleService.findByEnvironment(projectEnvironmentId)
    for (const current of existing) {
      if (!desiredNames.has(current.name)) {
        await this.scheduleService.removeByEnvironment(projectEnvironmentId, current.id)
      }
    }
  }

  private async waitForAppReady(environmentId: string, podIp: string, timeoutMs: number): Promise<boolean> {
    const upstream = this.proxyService.resolveAppUpstreamForProject({ id: environmentId, podIp })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${upstream}/`, { signal: AbortSignal.timeout(APP_FETCH_TIMEOUT_MS) })
        if (response.status >= 200 && response.status < 400) return true
      } catch (err) {
        this.logger.debug(`App not ready for ${environmentId}: ${(err as Error).message}`)
      }
      await sleep(APP_POLL_INTERVAL_MS)
    }
    return false
  }

  private async writeEnvFile(
    directory: string,
    variables: Record<string, string>,
    isFirstPublish: boolean,
  ): Promise<void> {
    const existing = isFirstPublish ? {} : await this.publishService.readEnvFile(directory)
    const merged = { ...existing, ...variables }
    const target = path.join(this.storageMountPath, directory, "app", "opsiforce.env.json")
    await writeJsonAtomic(target, merged)
  }

  private async restoreEnvFile(prodDir: string, variables: Record<string, string>): Promise<void> {
    const target = path.join(prodDir, "app", "opsiforce.env.json")
    await writeJsonAtomic(target, variables)
  }

  private async setStatus(
    jobId: string,
    status: PublishStatus,
    extra?: Partial<typeof projectPublishJobs.$inferInsert>,
  ): Promise<void> {
    const [row] = await db
      .update(projectPublishJobs)
      .set({ status, ...extra, updatedAt: new Date() })
      .where(eq(projectPublishJobs.id, jobId))
      .returning()
    if (row) await this.projectEvents.publish(row.projectId)
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object") return false
  return Object.values(value).every((entry) => typeof entry === "string")
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { InjectQueue } from "@nestjs/bullmq"
import { Queue } from "bullmq"
import { and, desc, eq, inArray } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { projectPublishJobs, projectSchedules } from "../../db/schema"
import { readEnvJson } from "../common/env-file"
import { EnvironmentService } from "../environment/environment.service"
import { ProjectEnvironmentService } from "../project-environment/project-environment.service"
import { ProjectStatus } from "../project/project.types"
import {
  PROJECT_PUBLISH_QUEUE,
  PublishDto,
  PublishFormResponse,
  PublishJobData,
  PublishJobResponse,
  PublishStatus,
  PublishTarget,
} from "./publish.types"

const ACTIVE_PUBLISH_STATUSES = [
  PublishStatus.Queued,
  PublishStatus.Committing,
  PublishStatus.Swapping,
  PublishStatus.Building,
  PublishStatus.Migrating,
]

@Injectable()
export class PublishService {
  private readonly storageMountPath: string
  private readonly platformVersion: string

  constructor(
    private readonly configService: ConfigService,
    private readonly environmentService: EnvironmentService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    @InjectQueue(PROJECT_PUBLISH_QUEUE)
    private readonly queue: Queue<PublishJobData>,
  ) {
    this.storageMountPath = this.configService.getOrThrow<string>("storageMountPath")
    this.platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
  }

  async listTargets(projectId: string, tenantId: string): Promise<PublishTarget[]> {
    const registry = (await this.environmentService.listForTenant(tenantId)).filter((env) => !env.isDefault)
    const instances = await this.projectEnvironmentService.listByProjectId(projectId)

    return registry.map((env) => {
      const instance = instances.find((i) => i.environmentId === env.id)
      return {
        environmentId: env.id,
        name: env.name,
        description: env.description,
        projectEnvironmentId: instance?.id ?? null,
        status: instance ? instance.status : null,
        deployedCommitSha: instance?.deployedCommitSha ?? null,
      }
    })
  }

  async getForm(projectId: string, tenantId: string, environmentId: string): Promise<PublishFormResponse> {
    const registryEnv = await this.environmentService.findForTenant(tenantId, environmentId)
    if (registryEnv.isDefault) {
      throw new BadRequestException("Cannot publish to the Development environment")
    }

    const devEnv = await this.projectEnvironmentService.findDefaultByProjectId(projectId)
    const instances = await this.projectEnvironmentService.listByProjectId(projectId)
    const instance = instances.find((i) => i.environmentId === environmentId)
    const isFirstPublish = !instance || instance.deployedCommitSha === null

    const devVars = await this.readEnvFile(devEnv.directory)
    const prodVars = instance ? await this.readEnvFile(instance.directory) : {}

    const variables = Object.keys(devVars).map((key) => ({
      key,
      value: instance && key in prodVars ? prodVars[key] : devVars[key],
    }))

    const devSchedules = await db
      .select({ id: projectSchedules.id, name: projectSchedules.name })
      .from(projectSchedules)
      .where(eq(projectSchedules.projectEnvironmentId, this.projectEnvironmentService.defaultEnvironmentId(projectId)))

    const schedules = devSchedules.map((s) => ({ id: s.id, name: s.name, selected: true }))

    return {
      environmentId,
      environmentName: registryEnv.name,
      isFirstPublish,
      variables,
      schedules,
    }
  }

  async publish(projectId: string, tenantId: string, dto: PublishDto): Promise<PublishJobResponse> {
    if (!dto || typeof dto.environmentId !== "string") {
      throw new BadRequestException("'environmentId' is required")
    }

    const registryEnv = await this.environmentService.findForTenant(tenantId, dto.environmentId)
    if (registryEnv.isDefault) {
      throw new BadRequestException("Cannot publish to the Development environment")
    }

    if (await this.hasActiveJob(projectId, dto.environmentId)) {
      throw new ConflictException("A publish is already in progress for this environment")
    }

    const instances = await this.projectEnvironmentService.listByProjectId(projectId)
    const existing = instances.find((i) => i.environmentId === dto.environmentId)
    const isFirstPublish = !existing || existing.deployedCommitSha === null
    const projectEnvironmentId = existing?.id ?? crypto.randomUUID()

    if (!existing) {
      const devEnv = await this.projectEnvironmentService.findDefaultByProjectId(projectId)
      try {
        await this.projectEnvironmentService.create({
          id: projectEnvironmentId,
          projectId,
          environmentId: dto.environmentId,
          isDefault: false,
          directory: `projects/${projectEnvironmentId}`,
          platformVersion: this.platformVersion,
          status: ProjectStatus.Publishing,
          authMode: devEnv.authMode,
        })
      } catch (err) {
        if (isProjectEnvironmentConflict(err)) {
          throw new ConflictException("A publish is already in progress for this environment")
        }
        throw err
      }
    }

    const publishJobId = crypto.randomUUID()
    try {
      await db.insert(projectPublishJobs).values({
        id: publishJobId,
        projectId,
        projectEnvironmentId,
        environmentId: dto.environmentId,
        tenantId,
        status: PublishStatus.Queued,
      })
    } catch (err) {
      if (isActivePublishConflict(err)) {
        throw new ConflictException("A publish is already in progress for this environment")
      }
      throw err
    }

    await this.queue.add(
      "publish",
      {
        publishJobId,
        projectId,
        projectEnvironmentId,
        environmentId: dto.environmentId,
        tenantId,
        isFirstPublish,
        variables: dto.variables ?? {},
        scheduleIds: dto.scheduleIds ?? [],
      },
      { jobId: publishJobId, attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    )

    return this.toJobResponse(publishJobId)
  }

  private async hasActiveJob(projectId: string, environmentId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: projectPublishJobs.id })
      .from(projectPublishJobs)
      .where(
        and(
          eq(projectPublishJobs.projectId, projectId),
          eq(projectPublishJobs.environmentId, environmentId),
          inArray(projectPublishJobs.status, ACTIVE_PUBLISH_STATUSES),
        ),
      )
      .limit(1)
    return !!row
  }

  async getLatestJob(projectId: string, environmentId: string): Promise<PublishJobResponse | null> {
    const [row] = await db
      .select()
      .from(projectPublishJobs)
      .where(
        and(eq(projectPublishJobs.projectId, projectId), eq(projectPublishJobs.environmentId, environmentId)),
      )
      .orderBy(desc(projectPublishJobs.createdAt))
      .limit(1)
    return row ? toResponse(row) : null
  }

  async getJob(jobId: string): Promise<PublishJobResponse> {
    return this.toJobResponse(jobId)
  }

  private async toJobResponse(jobId: string): Promise<PublishJobResponse> {
    const [row] = await db.select().from(projectPublishJobs).where(eq(projectPublishJobs.id, jobId))
    if (!row) throw new NotFoundException(`Publish job ${jobId} not found`)
    return toResponse(row)
  }

  async readEnvFile(directory: string): Promise<Record<string, string>> {
    return readEnvJson(this.storageMountPath, directory)
  }
}

function isActivePublishConflict(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  const constraint = (err as { constraint_name?: string })?.constraint_name
  return code === "23505" && constraint === "uq_project_publish_jobs_one_active"
}

function isProjectEnvironmentConflict(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  const constraint = (err as { constraint_name?: string })?.constraint_name
  return code === "23505" && constraint === "project_environments_project_id_environment_id_unique"
}

function toResponse(row: typeof projectPublishJobs.$inferSelect): PublishJobResponse {
  return {
    id: row.id,
    projectEnvironmentId: row.projectEnvironmentId,
    environmentId: row.environmentId,
    status: row.status as PublishStatus,
    commitSha: row.commitSha,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

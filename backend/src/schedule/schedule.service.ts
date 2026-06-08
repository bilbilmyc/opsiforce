import { Injectable, Logger, NotFoundException } from "@nestjs/common"
import { eq, and, desc } from "drizzle-orm"
import crypto from "crypto"
import { InjectQueue } from "@nestjs/bullmq"
import { Queue } from "bullmq"
import { db } from "../../db"
import {
  projectSchedules,
  scheduleExecutions,
  projects,
  projectSettings,
  projectEnvironments,
  environments,
} from "../../db/schema"
import type { CreateScheduleDto, UpdateScheduleDto, ScheduleJobData, ScheduleTrigger } from "./schedule.types"
import { SCHEDULE_QUEUE_NAME } from "./schedule.types"

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name)

  constructor(
    @InjectQueue(SCHEDULE_QUEUE_NAME) private readonly queue: Queue<ScheduleJobData>,
  ) {}

  async upsert(
    projectId: string,
    projectEnvironmentId: string,
    tenantId: string,
    dto: CreateScheduleDto,
  ) {
    const [settings] = await db
      .select({ timezone: projectSettings.timezone })
      .from(projectSettings)
      .where(eq(projectSettings.projectId, projectId))

    const tz = settings?.timezone || "UTC"

    const [row] = await db
      .insert(projectSchedules)
      .values({
        id: crypto.randomUUID(),
        projectId,
        projectEnvironmentId,
        tenantId,
        name: dto.name,
        cronPattern: dto.cronPattern,
        timeZone: tz,
        targetPath: dto.targetPath,
        method: dto.method || "POST",
        body: dto.body ?? null,
        headers: dto.headers ?? null,
        isActive: dto.isActive ?? true,
      })
      .onConflictDoUpdate({
        target: [projectSchedules.projectEnvironmentId, projectSchedules.name],
        set: {
          cronPattern: dto.cronPattern,
          targetPath: dto.targetPath,
          method: dto.method || "POST",
          body: dto.body ?? null,
          headers: dto.headers ?? null,
          timeZone: tz,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedAt: new Date(),
        },
      })
      .returning()

    await this.syncJobScheduler(row.id, row.cronPattern, row.timeZone, row.isActive)

    this.logger.log(`Upserted schedule "${dto.name}" for environment ${projectEnvironmentId}`)
    return row
  }

  async findByEnvironment(projectEnvironmentId: string) {
    return db
      .select()
      .from(projectSchedules)
      .where(eq(projectSchedules.projectEnvironmentId, projectEnvironmentId))
      .orderBy(desc(projectSchedules.createdAt))
  }

  async findByTenant(tenantId: string, environmentId?: string) {
    const conditions = [eq(projectSchedules.tenantId, tenantId)]
    if (environmentId) {
      conditions.push(eq(projectEnvironments.environmentId, environmentId))
    }

    return db
      .select({
        id: projectSchedules.id,
        projectId: projectSchedules.projectId,
        projectEnvironmentId: projectSchedules.projectEnvironmentId,
        tenantId: projectSchedules.tenantId,
        name: projectSchedules.name,
        cronPattern: projectSchedules.cronPattern,
        timeZone: projectSchedules.timeZone,
        targetPath: projectSchedules.targetPath,
        method: projectSchedules.method,
        body: projectSchedules.body,
        headers: projectSchedules.headers,
        isActive: projectSchedules.isActive,
        createdAt: projectSchedules.createdAt,
        updatedAt: projectSchedules.updatedAt,
        projectTitle: projects.title,
        environmentName: environments.name,
        isDefault: projectEnvironments.isDefault,
      })
      .from(projectSchedules)
      .innerJoin(projects, eq(projects.id, projectSchedules.projectId))
      .leftJoin(projectEnvironments, eq(projectEnvironments.id, projectSchedules.projectEnvironmentId))
      .leftJoin(environments, eq(environments.id, projectEnvironments.environmentId))
      .where(and(...conditions))
      .orderBy(desc(projectSchedules.createdAt))
  }

  async findOne(scheduleId: string, tenantId: string) {
    const [schedule] = await db
      .select()
      .from(projectSchedules)
      .where(and(eq(projectSchedules.id, scheduleId), eq(projectSchedules.tenantId, tenantId)))

    if (!schedule) throw new NotFoundException(`Schedule ${scheduleId} not found`)
    return schedule
  }

  async findOneRaw(scheduleId: string) {
    const [schedule] = await db
      .select()
      .from(projectSchedules)
      .where(eq(projectSchedules.id, scheduleId))

    return schedule ?? null
  }

  async update(scheduleId: string, tenantId: string, dto: UpdateScheduleDto) {
    const schedule = await this.findOne(scheduleId, tenantId)

    const updates: Record<string, unknown> = { updatedAt: new Date() }
    if (dto.cronPattern !== undefined) updates.cronPattern = dto.cronPattern
    if (dto.targetPath !== undefined) updates.targetPath = dto.targetPath
    if (dto.method !== undefined) updates.method = dto.method
    if (dto.body !== undefined) updates.body = dto.body
    if (dto.headers !== undefined) updates.headers = dto.headers
    if (dto.isActive !== undefined) updates.isActive = dto.isActive

    const [updated] = await db
      .update(projectSchedules)
      .set(updates)
      .where(eq(projectSchedules.id, scheduleId))
      .returning()

    const cron = dto.cronPattern ?? schedule.cronPattern
    const tz = schedule.timeZone
    const active = dto.isActive ?? schedule.isActive
    await this.syncJobScheduler(scheduleId, cron, tz, active)

    this.logger.log(`Updated schedule ${scheduleId}`)
    return updated
  }

  async remove(scheduleId: string, tenantId: string) {
    await this.findOne(scheduleId, tenantId)
    await this.removeJobScheduler(scheduleId)
    await db.delete(projectSchedules).where(eq(projectSchedules.id, scheduleId))
    this.logger.log(`Deleted schedule ${scheduleId}`)
  }

  async removeByEnvironment(projectEnvironmentId: string, scheduleId: string) {
    const [schedule] = await db
      .select()
      .from(projectSchedules)
      .where(
        and(
          eq(projectSchedules.projectEnvironmentId, projectEnvironmentId),
          eq(projectSchedules.id, scheduleId),
        ),
      )

    if (!schedule) throw new NotFoundException(`Schedule ${scheduleId} not found`)

    await this.removeJobScheduler(schedule.id)
    await db.delete(projectSchedules).where(eq(projectSchedules.id, schedule.id))
    this.logger.log(`Deleted schedule ${scheduleId} for environment ${projectEnvironmentId}`)
  }

  async removeAllForProject(projectId: string) {
    const rows = await db
      .select({ id: projectSchedules.id })
      .from(projectSchedules)
      .where(eq(projectSchedules.projectId, projectId))

    await Promise.all(rows.map((row) => this.removeJobScheduler(row.id).catch(() => {})))

    await db.delete(projectSchedules).where(eq(projectSchedules.projectId, projectId))
    this.logger.log(`Removed all schedules for project ${projectId}`)
  }

  async removeAllForEnvironment(projectEnvironmentId: string): Promise<void> {
    const rows = await db
      .select({ id: projectSchedules.id })
      .from(projectSchedules)
      .where(eq(projectSchedules.projectEnvironmentId, projectEnvironmentId))

    await Promise.all(rows.map((row) => this.removeJobScheduler(row.id).catch(() => {})))

    await db.delete(projectSchedules).where(eq(projectSchedules.projectEnvironmentId, projectEnvironmentId))
    this.logger.log(`Removed all schedules for environment ${projectEnvironmentId}`)
  }

  async triggerNow(scheduleId: string) {
    await this.queue.add("manual", { scheduleId }, { jobId: `manual:${scheduleId}:${Date.now()}` })
  }

  async getExecutions(scheduleId: string, limit = 50) {
    return db
      .select()
      .from(scheduleExecutions)
      .where(eq(scheduleExecutions.scheduleId, scheduleId))
      .orderBy(desc(scheduleExecutions.firedAt))
      .limit(limit)
  }

  async recordExecution(
    scheduleId: string,
    trigger: ScheduleTrigger,
    statusCode: number | null,
    latencyMs: number | null,
    error?: string,
  ) {
    await db.insert(scheduleExecutions).values({
      id: crypto.randomUUID(),
      scheduleId,
      trigger,
      statusCode,
      latencyMs,
      error: error ?? null,
    })
  }

  private async syncJobScheduler(scheduleId: string, cronPattern: string, tz: string, isActive: boolean) {
    const schedulerId = `schedule:${scheduleId}`
    if (!isActive) {
      await this.removeJobScheduler(scheduleId)
      return
    }

    await this.queue.upsertJobScheduler(
      schedulerId,
      { pattern: cronPattern, tz },
      { name: "fire-schedule", data: { scheduleId } },
    )
  }

  private async removeJobScheduler(scheduleId: string) {
    await this.queue.removeJobScheduler(`schedule:${scheduleId}`)
  }

}

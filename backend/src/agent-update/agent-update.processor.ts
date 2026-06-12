import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger, OnApplicationShutdown } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Job } from "bullmq"
import { and, desc, eq, notInArray } from "drizzle-orm"
import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import { db } from "../../db"
import { projectAgentUpdates, projectEnvironments, projects } from "../../db/schema"
import { ProjectService } from "../project/project.service"
import { ProjectStatus } from "../project/project.types"
import { AgentUpdateK8sService } from "./agent-update.k8s.service"
import { AgentUpdateService } from "./agent-update.service"
import {
  AGENT_WORKSPACE_UPDATE_QUEUE,
  AgentUpdateStatus,
  type AgentProjectJobData,
  type AgentReloadJobData,
  type AgentUpdateJobData,
  type AgentWorkspaceMigrationSummary,
} from "./agent-update.types"

@Processor(AGENT_WORKSPACE_UPDATE_QUEUE)
export class AgentUpdateProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(AgentUpdateProcessor.name)
  private readonly storageMountPath: string

  constructor(
    private readonly agentUpdateService: AgentUpdateService,
    private readonly k8sService: AgentUpdateK8sService,
    private readonly projectService: ProjectService,
    private readonly configService: ConfigService,
  ) {
    super()
    this.storageMountPath = this.configService.getOrThrow<string>("storageMountPath")
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal ${signal ?? ""} received, draining worker...`)
    await this.worker.close()
  }

  async process(job: Job<AgentUpdateJobData>): Promise<void> {
    if (job.name === "reload") return this.processReload(job.data as AgentReloadJobData)
    if (job.name === "sweep") return this.processSweep()
    return this.processProject(job.data as AgentProjectJobData)
  }

  private async processSweep(): Promise<void> {
    const agentName = this.agentUpdateService.agentName()
    const targetVersion = this.agentUpdateService.agentTemplateVersion(agentName)
    const rows = await db
      .select({ id: projectEnvironments.id, directory: projectEnvironments.directory })
      .from(projectEnvironments)
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .where(
        and(
          eq(projectEnvironments.isDefault, true),
          notInArray(projectEnvironments.status, [ProjectStatus.Pending, ProjectStatus.Claiming]),
        ),
      )
    const candidates: Array<{ id: string }> = []
    for (const row of rows) {
      if (!(await this.workspaceAtTarget(row.directory, agentName, targetVersion))) {
        candidates.push({ id: row.id })
      }
    }
    await this.agentUpdateService.enqueueProjectUpdates(candidates, agentName, targetVersion)
  }

  private async processReload(data: AgentReloadJobData): Promise<void> {
    const result = await this.agentUpdateService.applyPendingReload(data.updateId)
    if (result.status === "pending") {
      await db
        .update(projectAgentUpdates)
        .set({ reloadAttempt: data.attempt, updatedAt: new Date() })
        .where(eq(projectAgentUpdates.id, data.updateId))
      await this.agentUpdateService.enqueueReload(data.updateId, data.attempt + 1)
    }
  }

  private async processProject(data: AgentProjectJobData): Promise<void> {
    const project = await this.projectService.findOneById(data.projectId)
    if (project.status === ProjectStatus.Pending || project.status === ProjectStatus.Claiming) return
    if (await this.workspaceAtTarget(project.directory, data.agentName, data.targetVersion)) return

    const agentId = await this.agentUpdateService.resolveAgentId(data.agentName)
    const fromVersion = await this.lastAppliedVersion(project.id, agentId)
    const updateId = crypto.randomUUID()

    await db.insert(projectAgentUpdates).values({
      id: updateId,
      projectId: project.id,
      agentId,
      fromVersion,
      targetVersion: data.targetVersion,
      status: AgentUpdateStatus.Running,
      startedAt: new Date(),
      updatedAt: new Date(),
    })

    try {
      const result = await this.k8sService.run({
        projectId: project.id,
        directory: project.directory,
        agentName: data.agentName,
        targetVersion: data.targetVersion,
        agentModel: this.agentUpdateService.agentModel(data.agentName),
      })
      const summary = await this.readSummary(project.directory, data.agentName, result.logs)
      await this.recordOutcome(updateId, summary, result.succeeded)

      if (this.needsDeferredReload(project, summary)) {
        const reload = await this.agentUpdateService.applyPendingReload(updateId)
        if (reload.status === "pending") await this.agentUpdateService.enqueueReload(updateId, 1)
      }

      if (!result.succeeded || summary.status === "failed") {
        throw new Error(summary.error ?? "Agent update job failed")
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await db
        .update(projectAgentUpdates)
        .set({
          status: AgentUpdateStatus.Failed,
          error,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectAgentUpdates.id, updateId))
      this.logger.warn(`Agent update failed for project ${project.id}: ${error}`)
      throw err
    }
  }

  private async workspaceAtTarget(directory: string, agentName: string, targetVersion: string): Promise<boolean> {
    if (!directory) return false
    const ledger = await this.readLedger(directory, agentName)
    if (ledger?.agentVersion !== targetVersion) return false
    const targetModel = this.agentUpdateService.agentModel(agentName)
    if (!targetModel) return true
    return (await this.readWorkspaceModel(directory)) === targetModel
  }

  private async lastAppliedVersion(projectId: string, agentId: string): Promise<string | null> {
    const [row] = await db
      .select({ targetVersion: projectAgentUpdates.targetVersion })
      .from(projectAgentUpdates)
      .where(
        and(
          eq(projectAgentUpdates.projectId, projectId),
          eq(projectAgentUpdates.agentId, agentId),
          eq(projectAgentUpdates.status, AgentUpdateStatus.Applied),
        ),
      )
      .orderBy(desc(projectAgentUpdates.createdAt))
      .limit(1)
    return row?.targetVersion ?? null
  }

  private async recordOutcome(
    updateId: string,
    summary: AgentWorkspaceMigrationSummary,
    succeeded: boolean,
  ): Promise<void> {
    const status = this.computeOutcomeStatus(summary, succeeded)
    const now = new Date()
    await db
      .update(projectAgentUpdates)
      .set({
        status,
        targetVersion: summary.targetVersion,
        appliedMigrations: summary.appliedMigrations,
        skippedMigrations: summary.skippedMigrations,
        conflicts: summary.conflicts,
        failedMigrations: summary.failedMigrations,
        requiresOpenCodeReload: summary.requiresOpenCodeReload,
        requiresPodRecreate: summary.requiresPodRecreate,
        reloadStatus: status === AgentUpdateStatus.ReloadPending ? "pending:queued" : null,
        error: summary.error ?? null,
        finishedAt: status === AgentUpdateStatus.ReloadPending ? null : now,
        updatedAt: now,
      })
      .where(eq(projectAgentUpdates.id, updateId))
  }

  private computeOutcomeStatus(
    summary: AgentWorkspaceMigrationSummary,
    succeeded: boolean,
  ): (typeof AgentUpdateStatus)[keyof typeof AgentUpdateStatus] {
    if (!succeeded || summary.status === "failed" || summary.failedMigrations.length > 0) return AgentUpdateStatus.Failed
    if (summary.conflicts.length > 0) return AgentUpdateStatus.Conflict
    if (summary.requiresOpenCodeReload || summary.requiresPodRecreate) return AgentUpdateStatus.ReloadPending
    return AgentUpdateStatus.Applied
  }

  private needsDeferredReload(
    project: { podIp: string | null },
    summary: AgentWorkspaceMigrationSummary,
  ): boolean {
    if (!project.podIp) return false
    return summary.requiresOpenCodeReload || summary.requiresPodRecreate
  }

  private async readSummary(
    directory: string,
    agentName: string,
    logsFallback: string,
  ): Promise<AgentWorkspaceMigrationSummary> {
    const summaryPath = path.join(this.storageMountPath, directory, ".opsiforce", "agents", `${agentName}.summary.json`)
    try {
      const raw = await readFile(summaryPath, "utf8")
      const normalized = this.normalizeSummary(JSON.parse(raw) as AgentWorkspaceMigrationSummary)
      await rm(summaryPath, { force: true })
      return normalized
    } catch {
      return this.parseSummaryFromLogs(logsFallback)
    }
  }

  private async readLedger(directory: string, agentName: string): Promise<{ agentVersion?: string } | null> {
    const ledgerPath = path.join(this.storageMountPath, directory, ".opsiforce", "agents", `${agentName}.json`)
    try {
      return JSON.parse(await readFile(ledgerPath, "utf8")) as { agentVersion?: string }
    } catch {
      return null
    }
  }

  private async readWorkspaceModel(directory: string): Promise<string | null> {
    const configPath = path.join(this.storageMountPath, directory, ".xdg", "config", "opencode", "opencode.json")
    try {
      const config = JSON.parse(await readFile(configPath, "utf8")) as { model?: string }
      return typeof config.model === "string" ? config.model : null
    } catch {
      return null
    }
  }

  private parseSummaryFromLogs(logs: string): AgentWorkspaceMigrationSummary {
    const lines = logs.split("\n").map((line) => line.trim()).filter(Boolean).toReversed()
    for (const line of lines) {
      if (!line.startsWith("{") || !line.endsWith("}")) continue
      const parsed = JSON.parse(line) as AgentWorkspaceMigrationSummary
      if (parsed.agentName && parsed.targetVersion && parsed.status) return this.normalizeSummary(parsed)
    }
    throw new Error("Agent update job did not return a migration summary")
  }

  private normalizeSummary(summary: AgentWorkspaceMigrationSummary): AgentWorkspaceMigrationSummary {
    return {
      ...summary,
      appliedMigrations: Array.isArray(summary.appliedMigrations) ? summary.appliedMigrations : [],
      skippedMigrations: Array.isArray(summary.skippedMigrations) ? summary.skippedMigrations : [],
      failedMigrations: Array.isArray(summary.failedMigrations) ? summary.failedMigrations : [],
      conflicts: Array.isArray(summary.conflicts) ? summary.conflicts : [],
    }
  }
}

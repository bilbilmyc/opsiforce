import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Job } from "bullmq"
import { eq, lte } from "drizzle-orm"
import { readdir, rm, rmdir } from "fs/promises"
import path from "path"
import { db } from "../../db"
import { deletedProjects, projects } from "../../db/schema"

export const WORKSPACE_CLEANUP_QUEUE = "workspace-cleanup"

@Processor(WORKSPACE_CLEANUP_QUEUE)
export class WorkspaceCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkspaceCleanupProcessor.name)
  private readonly storageMountPath: string
  private readonly retentionDays: number

  constructor(private readonly configService: ConfigService) {
    super()
    this.storageMountPath = this.configService.getOrThrow<string>("storageMountPath")
    this.retentionDays = this.configService.getOrThrow<number>("workspaceCleanupRetentionDays")
  }

  async process(_job: Job): Promise<void> {
    await this.removeExpiredWorkspaces()
    await this.removeOrphanedWorkspaces()
  }

  private async removeExpiredWorkspaces(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000)
    const expired = await db.select().from(deletedProjects).where(lte(deletedProjects.deletedAt, cutoff))

    if (expired.length === 0) return

    this.logger.log(`Found ${expired.length} expired workspace(s) to clean up`)
    const tenantDirs = new Set<string>()

    for (const record of expired) {
      const workspacePath = path.join(this.storageMountPath, record.directory)

      await rm(workspacePath, { recursive: true, force: true }).catch((err) => {
        this.logger.warn(`Failed to remove workspace ${record.directory}: ${(err as Error).message}`)
      })

      await db.delete(deletedProjects).where(eq(deletedProjects.id, record.id))
      tenantDirs.add(path.join(this.storageMountPath, "projects", record.tenantId))
    }

    for (const tenantDir of tenantDirs) {
      await this.removeIfEmpty(tenantDir)
    }

    this.logger.log(`Removed ${expired.length} expired workspace(s)`)
  }

  private async removeOrphanedWorkspaces(): Promise<void> {
    const projectsDir = path.join(this.storageMountPath, "projects")
    const tenantDirs = await readdir(projectsDir).catch(() => [] as string[])
    if (tenantDirs.length === 0) return

    const activeIds = new Set(
      (await db.select({ id: projects.id }).from(projects)).map((p) => p.id),
    )
    const trackedIds = new Set(
      (await db.select({ id: deletedProjects.id }).from(deletedProjects)).map((p) => p.id),
    )

    let removed = 0

    for (const tenantId of tenantDirs) {
      const tenantPath = path.join(projectsDir, tenantId)
      const projectDirs = await readdir(tenantPath).catch(() => [] as string[])

      for (const projectId of projectDirs) {
        if (activeIds.has(projectId) || trackedIds.has(projectId)) continue

        await rm(path.join(tenantPath, projectId), { recursive: true, force: true }).catch((err) => {
          this.logger.warn(`Failed to remove orphaned workspace projects/${tenantId}/${projectId}: ${(err as Error).message}`)
        })
        removed++
      }

      await this.removeIfEmpty(tenantPath)
    }

    if (removed > 0) {
      this.logger.log(`Removed ${removed} orphaned workspace(s)`)
    }
  }

  private async removeIfEmpty(dirPath: string): Promise<void> {
    const entries = await readdir(dirPath).catch(() => ["_"])
    if (entries.length === 0) {
      await rmdir(dirPath).catch(() => {})
    }
  }
}

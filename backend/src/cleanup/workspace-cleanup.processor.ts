import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Job } from "bullmq"
import { eq, lte } from "drizzle-orm"
import { readdir, rm, rmdir } from "fs/promises"
import path from "path"
import { db } from "../../db"
import { deletedProjectEnvironments, deletedProjects, projectEnvironments } from "../../db/schema"

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
    await this.removeExpiredTombstones()
    await this.removeOrphanedDirectories()
  }

  private async removeExpiredTombstones(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000)
    const [expiredEnvironments, expiredProjects] = await Promise.all([
      db
        .select({ id: deletedProjectEnvironments.id, directory: deletedProjectEnvironments.directory })
        .from(deletedProjectEnvironments)
        .where(lte(deletedProjectEnvironments.deletedAt, cutoff)),
      db
        .select({ id: deletedProjects.id, directory: deletedProjects.directory })
        .from(deletedProjects)
        .where(lte(deletedProjects.deletedAt, cutoff)),
    ])

    const total = expiredEnvironments.length + expiredProjects.length
    if (total === 0) return
    this.logger.log(`Found ${total} expired workspace(s) to clean up`)

    for (const record of expiredEnvironments) {
      await this.removeTombstoneDirectory(record.directory)
      await db.delete(deletedProjectEnvironments).where(eq(deletedProjectEnvironments.id, record.id))
    }

    for (const record of expiredProjects) {
      await this.removeTombstoneDirectory(record.directory)
      await db.delete(deletedProjects).where(eq(deletedProjects.id, record.id))
    }

    this.logger.log(`Removed ${total} expired workspace(s)`)
  }

  private async removeTombstoneDirectory(directory: string): Promise<void> {
    const workspacePath = path.join(this.storageMountPath, directory)
    await rm(workspacePath, { recursive: true, force: true }).catch((err) => {
      this.logger.warn(`Failed to remove workspace ${directory}: ${(err as Error).message}`)
    })
    await this.pruneEmptyAncestors(path.dirname(directory))
  }

  private async removeOrphanedDirectories(): Promise<void> {
    const [environmentRows, deletedEnvironmentRows, deletedProjectRows] = await Promise.all([
      db.select({ directory: projectEnvironments.directory }).from(projectEnvironments),
      db.select({ directory: deletedProjectEnvironments.directory }).from(deletedProjectEnvironments),
      db.select({ directory: deletedProjects.directory }).from(deletedProjects),
    ])

    const knownPaths = new Set<string>()
    for (const row of environmentRows) knownPaths.add(row.directory)
    for (const row of deletedEnvironmentRows) knownPaths.add(row.directory)
    for (const row of deletedProjectRows) knownPaths.add(row.directory)

    const keepPrefixes = new Set<string>()
    for (const p of knownPaths) {
      let prefix: string | null = path.dirname(p)
      while (prefix && prefix !== "." && prefix !== path.sep) {
        keepPrefixes.add(prefix)
        const parent = path.dirname(prefix)
        prefix = parent === prefix ? null : parent
      }
    }

    const projectsRoot = path.join(this.storageMountPath, "projects")
    const removed = await this.walk(projectsRoot, "projects", knownPaths, keepPrefixes)
    if (removed > 0) this.logger.log(`Removed ${removed} orphaned workspace(s)`)
  }

  private async walk(
    absPath: string,
    relPath: string,
    knownPaths: Set<string>,
    keepPrefixes: Set<string>,
  ): Promise<number> {
    const entries = await readdir(absPath, { withFileTypes: true }).catch(() => [])
    let removed = 0

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const childAbs = path.join(absPath, entry.name)
      const childRel = path.posix.join(relPath, entry.name)

      if (knownPaths.has(childRel)) continue

      if (keepPrefixes.has(childRel)) {
        removed += await this.walk(childAbs, childRel, knownPaths, keepPrefixes)
        await this.removeIfEmpty(childAbs)
        continue
      }

      await rm(childAbs, { recursive: true, force: true }).catch((err) => {
        this.logger.warn(`Failed to remove orphaned workspace ${childRel}: ${(err as Error).message}`)
      })
      removed++
    }

    return removed
  }

  private async pruneEmptyAncestors(relDir: string): Promise<void> {
    let current = relDir
    while (current && current !== "." && current !== path.sep) {
      if (path.dirname(current) === ".") break
      const abs = path.join(this.storageMountPath, current)
      const removed = await this.removeIfEmpty(abs)
      if (!removed) break
      current = path.dirname(current)
    }
  }

  private async removeIfEmpty(dirPath: string): Promise<boolean> {
    const entries = await readdir(dirPath).catch(() => null)
    if (!entries || entries.length > 0) return false
    return rmdir(dirPath)
      .then(() => true)
      .catch(() => false)
  }
}

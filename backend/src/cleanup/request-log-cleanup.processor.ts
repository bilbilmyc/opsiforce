import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Job } from "bullmq"
import { access } from "fs/promises"
import path from "path"
import { open } from "sqlite"
import sqlite3 from "sqlite3"
import { db } from "../../db"
import { projects } from "../../db/schema"

export const REQUEST_LOG_CLEANUP_QUEUE = "request-log-cleanup"

@Processor(REQUEST_LOG_CLEANUP_QUEUE)
export class RequestLogCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(RequestLogCleanupProcessor.name)
  private readonly storageMountPath: string
  private readonly retentionDays: number

  constructor(private readonly configService: ConfigService) {
    super()
    this.storageMountPath = this.configService.getOrThrow<string>("storageMountPath")
    this.retentionDays = this.configService.getOrThrow<number>("requestLogRetentionDays")
  }

  async process(_job: Job): Promise<void> {
    const startedAt = Date.now()
    const rows = await db
      .select({ id: projects.id, directory: projects.directory })
      .from(projects)

    let scanned = 0
    let skipped = 0
    let totalDeleted = 0

    for (const row of rows) {
      const dbPath = path.join(this.storageMountPath, row.directory, "data", "database.db")

      const exists = await access(dbPath).then(() => true).catch(() => false)
      if (!exists) {
        skipped++
        continue
      }

      try {
        totalDeleted += await this.cleanupDatabase(dbPath)
        scanned++
      } catch (err) {
        this.logger.warn(
          `Failed to clean request log for project ${row.id} at ${dbPath}: ${(err as Error).message}`,
        )
      }
    }

    this.logger.log(
      `Request log cleanup finished: scanned=${scanned} skipped=${skipped} deleted=${totalDeleted} retentionDays=${this.retentionDays} durationMs=${Date.now() - startedAt}`,
    )
  }

  private async cleanupDatabase(dbPath: string): Promise<number> {
    const connection = await open({ filename: dbPath, driver: sqlite3.Database })
    try {
      await connection.exec("PRAGMA busy_timeout = 5000")
      const result = await connection.run(
        `DELETE FROM app_requests WHERE created_at < datetime('now', ?)`,
        `-${this.retentionDays} days`,
      )
      return result.changes ?? 0
    } finally {
      await connection.close().catch(() => {})
    }
  }
}

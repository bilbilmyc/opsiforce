import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { Job } from "bullmq"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { environments, projectEnvironments, projects, tenantSettings } from "../../db/schema"
import { ProjectAuthService } from "../project/project-auth.service"
import { MAKARA_AUTH_SYNC_QUEUE, type MakaraAuthSyncJobData } from "./tenant-settings.types"

@Processor(MAKARA_AUTH_SYNC_QUEUE)
export class MakaraAuthSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(MakaraAuthSyncProcessor.name)

  constructor(private readonly projectAuthService: ProjectAuthService) {
    super()
  }

  async process(job: Job<MakaraAuthSyncJobData>): Promise<void> {
    const { projectId, makaraTenantName: intendedName } = job.data

    const [row] = await db
      .select({
        tenantId: projects.tenantId,
        currentMakaraTenantName: tenantSettings.makaraTenantName,
      })
      .from(projects)
      .leftJoin(tenantSettings, eq(tenantSettings.tenantId, projects.tenantId))
      .where(eq(projects.id, projectId))

    if (!row) {
      this.logger.log(`Skipping Makara auth sync: project ${projectId} no longer exists`)
      return
    }

    const makaraEnvs = await db
      .select({ id: projectEnvironments.id, slug: environments.slug })
      .from(projectEnvironments)
      .leftJoin(environments, eq(environments.id, projectEnvironments.environmentId))
      .where(and(eq(projectEnvironments.projectId, projectId), eq(projectEnvironments.authMode, "makara")))

    if (makaraEnvs.length === 0) {
      this.logger.log(
        `Skipping Makara auth sync for project ${projectId}: no environment uses Makara auth`,
      )
      return
    }

    const currentName = row.currentMakaraTenantName
    if (!currentName) {
      this.logger.warn(
        `Skipping Makara auth sync for project ${projectId}: no Makara tenant mapping for tenant ${row.tenantId}`,
      )
      return
    }

    for (const env of makaraEnvs) {
      const { bypassAuthPaths } = await this.projectAuthService.getConfig(env.id, env.slug)
      await this.projectAuthService.applyMakara(env.id, env.slug, currentName, bypassAuthPaths)
    }

    const staleNote =
      currentName !== intendedName
        ? ` (job was enqueued for '${intendedName}', mapping has since changed)`
        : ""
    this.logger.log(
      `Synced Makara auth for ${makaraEnvs.length} environment(s) of project ${projectId} → ${currentName}${staleNote}`,
    )
  }
}

import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { Job } from "bullmq"
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { projectEnvironments, projects, tenantSettings } from "../../db/schema"
import { ProjectAuthService } from "../project/project-auth.service"
import { TENANT_MAKARA_REAPPLY_QUEUE, type MakaraReapplyJobData } from "./tenant-settings.types"

@Processor(TENANT_MAKARA_REAPPLY_QUEUE)
export class MakaraReapplyProcessor extends WorkerHost {
  private readonly logger = new Logger(MakaraReapplyProcessor.name)

  constructor(private readonly projectAuthService: ProjectAuthService) {
    super()
  }

  async process(job: Job<MakaraReapplyJobData>): Promise<void> {
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
      this.logger.log(`Skipping Makara reapply: project ${projectId} no longer exists`)
      return
    }

    const [makaraEnv] = await db
      .select({ id: projectEnvironments.id })
      .from(projectEnvironments)
      .where(and(eq(projectEnvironments.projectId, projectId), eq(projectEnvironments.authMode, "makara")))
      .limit(1)

    if (!makaraEnv) {
      this.logger.log(
        `Skipping Makara reapply for project ${projectId}: no environment uses Makara auth`,
      )
      return
    }

    const currentName = row.currentMakaraTenantName
    if (!currentName) {
      this.logger.warn(
        `Skipping Makara reapply for project ${projectId}: no Makara tenant mapping for tenant ${row.tenantId}`,
      )
      return
    }

    const { bypassAuthPaths } = await this.projectAuthService.getConfig(projectId)
    await this.projectAuthService.applyMakara(projectId, currentName, bypassAuthPaths)
    if (currentName !== intendedName) {
      this.logger.log(
        `Re-applied Makara auth for project ${projectId} → ${currentName} (job was enqueued for '${intendedName}', mapping has since changed)`,
      )
    } else {
      this.logger.log(`Re-applied Makara auth for project ${projectId} → ${currentName}`)
    }
  }
}

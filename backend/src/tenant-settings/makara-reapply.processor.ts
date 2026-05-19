import { Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { Job } from "bullmq"
import { ProjectAuthService } from "../project/project-auth.service"
import { TENANT_MAKARA_REAPPLY_QUEUE, type MakaraReapplyJobData } from "./tenant-settings.types"

@Processor(TENANT_MAKARA_REAPPLY_QUEUE)
export class MakaraReapplyProcessor extends WorkerHost {
  private readonly logger = new Logger(MakaraReapplyProcessor.name)

  constructor(private readonly projectAuthService: ProjectAuthService) {
    super()
  }

  async process(job: Job<MakaraReapplyJobData>): Promise<void> {
    const { projectId, makaraTenantName } = job.data
    const { bypassAuthPaths } = await this.projectAuthService.getConfig(projectId)
    await this.projectAuthService.applyMakara(projectId, makaraTenantName, bypassAuthPaths)
    this.logger.log(`Re-applied Makara auth for project ${projectId} → ${makaraTenantName}`)
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProjectExportService } from './project-export.service';

export const PROJECT_EXPORT_CLEANUP_QUEUE = 'project-export-cleanup';

@Processor(PROJECT_EXPORT_CLEANUP_QUEUE)
export class ProjectExportCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ProjectExportCleanupProcessor.name);

  constructor(private readonly exportService: ProjectExportService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const removed = await this.exportService.sweepExpiredArtifacts();
    if (removed > 0) this.logger.log(`Removed ${removed} expired export artifact(s)`);
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProjectImportUploadService } from './project-import-upload.service';

export const PROJECT_IMPORT_UPLOAD_CLEANUP_QUEUE = 'project-import-upload-cleanup';

@Processor(PROJECT_IMPORT_UPLOAD_CLEANUP_QUEUE)
export class ProjectImportUploadCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ProjectImportUploadCleanupProcessor.name);

  constructor(private readonly uploadService: ProjectImportUploadService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const removed = await this.uploadService.sweepAbandonedSessions();
    if (removed > 0) this.logger.log(`Removed ${removed} abandoned import upload session(s)`);
  }
}

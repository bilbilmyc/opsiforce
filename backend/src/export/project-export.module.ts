import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { ProjectExportController } from './project-export.controller';
import { ProjectExportService } from './project-export.service';
import { ProjectExportProcessor } from './project-export.processor';
import { ProjectExportCleanupProcessor, PROJECT_EXPORT_CLEANUP_QUEUE } from './project-export-cleanup.processor';
import { PROJECT_EXPORT_QUEUE } from './project-export.types';
import { GitModule } from '../git/git.module';
import { ProjectModule } from '../project/project.module';
import { ProjectEventsModule } from '../project/project-events.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_EXPORT_QUEUE }),
    BullModule.registerQueue({ name: PROJECT_EXPORT_CLEANUP_QUEUE }),
    BullBoardModule.forFeature({ name: PROJECT_EXPORT_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: PROJECT_EXPORT_CLEANUP_QUEUE, adapter: BullMQAdapter }),
    GitModule,
    ProjectModule,
    ProjectEventsModule,
  ],
  controllers: [ProjectExportController],
  providers: [ProjectExportService, ProjectExportProcessor, ProjectExportCleanupProcessor],
  exports: [ProjectExportService],
})
export class ProjectExportModule implements OnApplicationBootstrap {
  constructor(@InjectQueue(PROJECT_EXPORT_CLEANUP_QUEUE) private readonly cleanupQueue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.cleanupQueue.upsertJobScheduler(
      'project-export-cleanup-daily',
      { pattern: '0 3 * * *' },
      { name: 'cleanup' }
    );
  }
}

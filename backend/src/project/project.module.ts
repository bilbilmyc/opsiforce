import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ProjectController } from './project.controller';
import { AppAgentController } from './app.controller.agent';
import { AgentStatusController } from './agent-status.controller';
import { AgentStatusStreamController } from './agent-status-stream.controller';
import { PodClassController } from './pod-class.controller';
import { DownloadController } from './download.controller';
import { ProjectService } from './project.service';
import { ProjectAuthService } from './project-auth.service';
import { DownloadService } from './download.service';
import { ProjectFilesService } from './project-files.service';
import { ProjectDuplicateProcessor } from './project-duplicate.processor';
import { ProjectImportController } from './project-import.controller';
import { ProjectImportService } from './project-import.service';
import { ProjectImportProcessor } from './project-import.processor';
import { ProjectEventsModule } from './project-events.module';
import { AppService } from './app.service';
import { AppReadinessModule } from './app-readiness.module';
import { AgentStatusModule } from './agent-status.module';
import { PROJECT_DUPLICATE_QUEUE } from './project-duplicate.types';
import { PROJECT_IMPORT_QUEUE } from './project-import.types';
import { PodModule } from '../pod/pod.module';
import { TimeoutModule } from '../timeout/timeout.module';
import { BifrostModule } from '../bifrost/bifrost.module';
import { GatewayModule } from '../gateway/gateway.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { ProxyService } from '../proxy/proxy.service';
import { GitModule } from '../git/git.module';
import { ProjectPoolModule } from '../pool/project-pool.module';
import { EnvironmentModule } from '../environment/environment.module';
import { ProjectEnvironmentModule } from '../project-environment/project-environment.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_DUPLICATE_QUEUE }),
    BullModule.registerQueue({ name: PROJECT_IMPORT_QUEUE }),
    BullBoardModule.forFeature({
      name: PROJECT_DUPLICATE_QUEUE,
      adapter: BullMQAdapter,
    }),
    BullBoardModule.forFeature({
      name: PROJECT_IMPORT_QUEUE,
      adapter: BullMQAdapter,
    }),
    PodModule,
    TimeoutModule,
    forwardRef(() => BifrostModule),
    GatewayModule,
    ProjectEventsModule,
    forwardRef(() => ScheduleModule),
    ProjectPoolModule,
    EnvironmentModule,
    ProjectEnvironmentModule,
    GitModule,
    AppReadinessModule,
    AgentStatusModule,
  ],
  controllers: [
    ProjectController,
    AppAgentController,
    AgentStatusController,
    AgentStatusStreamController,
    PodClassController,
    DownloadController,
    ProjectImportController,
  ],
  providers: [
    ProjectService,
    ProjectAuthService,
    DownloadService,
    ProjectFilesService,
    ProjectDuplicateProcessor,
    ProjectImportService,
    ProjectImportProcessor,
    ProxyService,
    AppService,
  ],
  exports: [ProjectService, ProjectAuthService, ProjectFilesService, ProjectImportService, AppReadinessModule],
})
export class ProjectModule {}

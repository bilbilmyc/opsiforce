import { Module } from '@nestjs/common';
import { TimeoutService } from './timeout.service';
import { TimeoutListener } from './timeout.listener';
import { PodModule } from '../pod/pod.module';
import { ProjectEventsModule } from '../project/project-events.module';
import { AppReadinessModule } from '../project/app-readiness.module';
import { AgentStatusModule } from '../project/agent-status.module';

@Module({
  imports: [PodModule, ProjectEventsModule, AppReadinessModule, AgentStatusModule],
  providers: [TimeoutService, TimeoutListener],
  exports: [TimeoutService],
})
export class TimeoutModule {}

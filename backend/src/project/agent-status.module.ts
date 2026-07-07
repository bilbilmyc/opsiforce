import { Module } from '@nestjs/common';
import { PodModule } from '../pod/pod.module';
import { ProjectEnvironmentModule } from '../project-environment/project-environment.module';
import { ProxyService } from '../proxy/proxy.service';
import { AgentStatusService } from './agent-status.service';
import { ProjectEventsModule } from './project-events.module';

@Module({
  imports: [ProjectEventsModule, ProjectEnvironmentModule, PodModule],
  providers: [AgentStatusService, ProxyService],
  exports: [AgentStatusService],
})
export class AgentStatusModule {}

import { Module } from '@nestjs/common';
import { PodModule } from '../pod/pod.module';
import { ProjectEnvironmentModule } from '../project-environment/project-environment.module';
import { EnvironmentVariablesService } from './environment-variables.service';

@Module({
  imports: [PodModule, ProjectEnvironmentModule],
  providers: [EnvironmentVariablesService],
  exports: [EnvironmentVariablesService],
})
export class EnvironmentVariablesModule {}

import { Module } from '@nestjs/common';
import { ProjectEnvironmentService } from './project-environment.service';

@Module({
  providers: [ProjectEnvironmentService],
  exports: [ProjectEnvironmentService],
})
export class ProjectEnvironmentModule {}

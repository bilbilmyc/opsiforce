import { Module } from '@nestjs/common';
import { ProjectEventsService } from './project-events.service';

@Module({
  providers: [ProjectEventsService],
  exports: [ProjectEventsService],
})
export class ProjectEventsModule {}

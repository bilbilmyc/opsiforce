import { Module } from '@nestjs/common';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';
import { TranscriptionAvailabilityController } from './transcription-availability.controller';
import { TranscriptionAvailabilityService } from './transcription-availability.service';
import { BifrostModule } from '../bifrost/bifrost.module';
import { ProjectModule } from '../project/project.module';
import { ProjectEnvironmentModule } from '../project-environment/project-environment.module';

@Module({
  imports: [BifrostModule, ProjectModule, ProjectEnvironmentModule],
  controllers: [TranscriptionController, TranscriptionAvailabilityController],
  providers: [TranscriptionService, TranscriptionAvailabilityService],
})
export class TranscriptionModule {}

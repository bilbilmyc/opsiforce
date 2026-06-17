import { Module } from '@nestjs/common';
import { AppReadinessService } from './app-readiness.service';

@Module({
  providers: [AppReadinessService],
  exports: [AppReadinessService],
})
export class AppReadinessModule {}

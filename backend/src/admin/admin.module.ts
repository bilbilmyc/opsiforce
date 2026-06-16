import { Module } from '@nestjs/common';
import { PodsOverviewController } from './pods-overview.controller';
import { PodsOverviewService } from './pods-overview.service';
import { PodModule } from '../pod/pod.module';
import { TimeoutModule } from '../timeout/timeout.module';

@Module({
  imports: [PodModule, TimeoutModule],
  controllers: [PodsOverviewController],
  providers: [PodsOverviewService],
})
export class AdminModule {}

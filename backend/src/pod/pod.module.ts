import { Module } from '@nestjs/common';
import { PodService } from './pod.service';
import { PodCacheService } from './pod.cache.service';

@Module({
  providers: [PodService, PodCacheService],
  exports: [PodService, PodCacheService],
})
export class PodModule {}

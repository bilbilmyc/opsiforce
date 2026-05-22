import { Module } from "@nestjs/common"
import { PodService } from "./pod.service"
import { PodPoolService } from "./pod.pool.service"
import { PodCacheService } from "./pod.cache.service"

@Module({
  providers: [PodService, PodPoolService, PodCacheService],
  exports: [PodService, PodPoolService, PodCacheService],
})
export class PodModule {}

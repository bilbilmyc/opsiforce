import { Module } from "@nestjs/common"
import { PodService } from "./pod.service"
import { PodPoolService } from "./pod.pool.service"

@Module({
  providers: [PodService, PodPoolService],
  exports: [PodService, PodPoolService],
})
export class PodModule {}

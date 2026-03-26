import { Module } from "@nestjs/common"
import { TimeoutService } from "./timeout.service"
import { TimeoutCron } from "./timeout.cron"
import { PodModule } from "../pod/pod.module"

@Module({
  imports: [PodModule],
  providers: [TimeoutService, TimeoutCron],
  exports: [TimeoutService],
})
export class TimeoutModule {}

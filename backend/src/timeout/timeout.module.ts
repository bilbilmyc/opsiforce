import { Module } from "@nestjs/common"
import { TimeoutService } from "./timeout.service"
import { TimeoutListener } from "./timeout.listener"
import { PodModule } from "../pod/pod.module"

@Module({
  imports: [PodModule],
  providers: [TimeoutService, TimeoutListener],
  exports: [TimeoutService],
})
export class TimeoutModule {}

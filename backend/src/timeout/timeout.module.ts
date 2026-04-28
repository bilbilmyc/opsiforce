import { Module } from "@nestjs/common"
import { TimeoutService } from "./timeout.service"
import { TimeoutListener } from "./timeout.listener"
import { PodModule } from "../pod/pod.module"
import { ProjectEventsModule } from "../project/project-events.module"

@Module({
  imports: [PodModule, ProjectEventsModule],
  providers: [TimeoutService, TimeoutListener],
  exports: [TimeoutService],
})
export class TimeoutModule {}

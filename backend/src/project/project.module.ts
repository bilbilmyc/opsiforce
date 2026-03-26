import { Module } from "@nestjs/common"
import { ProjectController } from "./project.controller"
import { ProjectService } from "./project.service"
import { PodModule } from "../pod/pod.module"
import { TimeoutModule } from "../timeout/timeout.module"

@Module({
  imports: [PodModule, TimeoutModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}

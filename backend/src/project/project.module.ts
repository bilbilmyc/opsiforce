import { Module, forwardRef } from "@nestjs/common"
import { ProjectController } from "./project.controller"
import { ProjectService } from "./project.service"
import { PodModule } from "../pod/pod.module"
import { TimeoutModule } from "../timeout/timeout.module"
import { BifrostModule } from "../bifrost/bifrost.module"

@Module({
  imports: [PodModule, TimeoutModule, forwardRef(() => BifrostModule)],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}

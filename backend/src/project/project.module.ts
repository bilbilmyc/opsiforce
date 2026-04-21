import { Module, forwardRef } from "@nestjs/common"
import { ProjectController } from "./project.controller"
import { ProjectService } from "./project.service"
import { PodModule } from "../pod/pod.module"
import { TimeoutModule } from "../timeout/timeout.module"
import { BifrostModule } from "../bifrost/bifrost.module"
import { GatewayModule } from "../gateway/gateway.module"
import { ScheduleModule } from "../schedule/schedule.module"
import { ProxyService } from "../proxy/proxy.service"

@Module({
  imports: [PodModule, TimeoutModule, forwardRef(() => BifrostModule), GatewayModule, forwardRef(() => ScheduleModule)],
  controllers: [ProjectController],
  providers: [ProjectService, ProxyService],
  exports: [ProjectService],
})
export class ProjectModule {}

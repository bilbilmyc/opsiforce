import { Module, forwardRef } from "@nestjs/common"
import { BullModule } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ProjectController } from "./project.controller"
import { ProjectService } from "./project.service"
import { ProjectAuthService } from "./project-auth.service"
import { ProjectDuplicateProcessor } from "./project-duplicate.processor"
import { ProjectEventsModule } from "./project-events.module"
import { AppService } from "./app.service"
import { PROJECT_DUPLICATE_QUEUE } from "./project-duplicate.types"
import { PodModule } from "../pod/pod.module"
import { TimeoutModule } from "../timeout/timeout.module"
import { BifrostModule } from "../bifrost/bifrost.module"
import { GatewayModule } from "../gateway/gateway.module"
import { ScheduleModule } from "../schedule/schedule.module"
import { ProxyService } from "../proxy/proxy.service"
import { ProjectPoolModule } from "../pool/project-pool.module"

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_DUPLICATE_QUEUE }),
    BullBoardModule.forFeature({
      name: PROJECT_DUPLICATE_QUEUE,
      adapter: BullMQAdapter,
    }),
    PodModule,
    TimeoutModule,
    forwardRef(() => BifrostModule),
    GatewayModule,
    ProjectEventsModule,
    forwardRef(() => ScheduleModule),
    ProjectPoolModule,
  ],
  controllers: [ProjectController],
  providers: [ProjectService, ProjectAuthService, ProjectDuplicateProcessor, ProxyService, AppService],
  exports: [ProjectService, ProjectAuthService],
})
export class ProjectModule {}

import { Module, forwardRef } from "@nestjs/common"
import { BullModule } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { PublishController } from "./publish.controller"
import { PublishService } from "./publish.service"
import { PublishProcessor } from "./publish.processor"
import { GitService } from "./git.service"
import { PROJECT_PUBLISH_QUEUE } from "./publish.types"
import { ProjectModule } from "../project/project.module"
import { ProjectEventsModule } from "../project/project-events.module"
import { ProjectEnvironmentModule } from "../project-environment/project-environment.module"
import { EnvironmentModule } from "../environment/environment.module"
import { BifrostModule } from "../bifrost/bifrost.module"
import { GatewayModule } from "../gateway/gateway.module"
import { PodModule } from "../pod/pod.module"
import { ProxyModule } from "../proxy/proxy.module"
import { ScheduleModule } from "../schedule/schedule.module"

@Module({
  imports: [
    BullModule.registerQueue({ name: PROJECT_PUBLISH_QUEUE }),
    BullBoardModule.forFeature({ name: PROJECT_PUBLISH_QUEUE, adapter: BullMQAdapter }),
    ProjectModule,
    ProjectEventsModule,
    ProjectEnvironmentModule,
    EnvironmentModule,
    forwardRef(() => BifrostModule),
    GatewayModule,
    PodModule,
    ProxyModule,
    forwardRef(() => ScheduleModule),
  ],
  controllers: [PublishController],
  providers: [PublishService, PublishProcessor, GitService],
  exports: [PublishService],
})
export class PublishModule {}

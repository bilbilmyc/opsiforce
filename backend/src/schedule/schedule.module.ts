import { Module, forwardRef } from "@nestjs/common"
import { BullModule } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ScheduleService } from "./schedule.service"
import { ScheduleWorker } from "./schedule.worker"
import { ScheduleAgentController } from "./schedule.controller.agent"
import { ScheduleAdminController } from "./schedule.controller.admin"
import { GatewayModule } from "../gateway/gateway.module"
import { ProjectModule } from "../project/project.module"
import { ProxyService } from "../proxy/proxy.service"
import { SCHEDULE_QUEUE_NAME } from "./schedule.types"

@Module({
  imports: [
    BullModule.registerQueue({ name: SCHEDULE_QUEUE_NAME }),
    BullBoardModule.forFeature({ name: SCHEDULE_QUEUE_NAME, adapter: BullMQAdapter }),
    GatewayModule,
    forwardRef(() => ProjectModule),
  ],
  controllers: [ScheduleAgentController, ScheduleAdminController],
  providers: [ScheduleService, ScheduleWorker, ProxyService],
  exports: [ScheduleService],
})
export class ScheduleModule {}

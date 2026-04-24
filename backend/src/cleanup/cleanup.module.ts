import { Module, OnApplicationBootstrap } from "@nestjs/common"
import { BullModule, InjectQueue } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { Queue } from "bullmq"
import { WorkspaceCleanupProcessor, WORKSPACE_CLEANUP_QUEUE } from "./workspace-cleanup.processor"
import {
  RequestLogCleanupProcessor,
  REQUEST_LOG_CLEANUP_QUEUE,
} from "./request-log-cleanup.processor"

@Module({
  imports: [
    BullModule.registerQueue({ name: WORKSPACE_CLEANUP_QUEUE }),
    BullModule.registerQueue({ name: REQUEST_LOG_CLEANUP_QUEUE }),
    BullBoardModule.forFeature({ name: WORKSPACE_CLEANUP_QUEUE, adapter: BullMQAdapter }),
    BullBoardModule.forFeature({ name: REQUEST_LOG_CLEANUP_QUEUE, adapter: BullMQAdapter }),
  ],
  providers: [WorkspaceCleanupProcessor, RequestLogCleanupProcessor],
})
export class CleanupModule implements OnApplicationBootstrap {
  constructor(
    @InjectQueue(WORKSPACE_CLEANUP_QUEUE) private readonly workspaceCleanupQueue: Queue,
    @InjectQueue(REQUEST_LOG_CLEANUP_QUEUE) private readonly requestLogCleanupQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.workspaceCleanupQueue.upsertJobScheduler(
      "workspace-cleanup-daily",
      { pattern: "0 3 * * *" },
      { name: "cleanup" },
    )
    await this.requestLogCleanupQueue.upsertJobScheduler(
      "request-log-cleanup-3d",
      { pattern: "0 4 */3 * *" },
      { name: "cleanup" },
    )
  }
}

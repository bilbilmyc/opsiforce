import { Module, OnApplicationBootstrap } from "@nestjs/common"
import { BullModule, InjectQueue } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { Queue } from "bullmq"
import { WorkspaceCleanupProcessor, WORKSPACE_CLEANUP_QUEUE } from "./workspace-cleanup.processor"

@Module({
  imports: [
    BullModule.registerQueue({ name: WORKSPACE_CLEANUP_QUEUE }),
    BullBoardModule.forFeature({ name: WORKSPACE_CLEANUP_QUEUE, adapter: BullMQAdapter }),
  ],
  providers: [WorkspaceCleanupProcessor],
})
export class CleanupModule implements OnApplicationBootstrap {
  constructor(@InjectQueue(WORKSPACE_CLEANUP_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      "workspace-cleanup-daily",
      { pattern: "0 3 * * *" },
      { name: "cleanup" },
    )
  }
}

import { Module, forwardRef } from "@nestjs/common"
import { BullModule } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ProjectModule } from "../project/project.module"
import { TenantSettingsController } from "./tenant-settings.controller"
import { TenantSettingsService } from "./tenant-settings.service"
import { MakaraAuthSyncProcessor } from "./makara-auth-sync.processor"
import { MAKARA_AUTH_SYNC_QUEUE } from "./tenant-settings.types"

@Module({
  imports: [
    BullModule.registerQueue({ name: MAKARA_AUTH_SYNC_QUEUE }),
    BullBoardModule.forFeature({ name: MAKARA_AUTH_SYNC_QUEUE, adapter: BullMQAdapter }),
    forwardRef(() => ProjectModule),
  ],
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService, MakaraAuthSyncProcessor],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}

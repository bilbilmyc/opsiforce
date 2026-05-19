import { Module, forwardRef } from "@nestjs/common"
import { BullModule } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ProjectModule } from "../project/project.module"
import { TenantSettingsController } from "./tenant-settings.controller"
import { TenantSettingsService } from "./tenant-settings.service"
import { MakaraReapplyProcessor } from "./makara-reapply.processor"
import { TENANT_MAKARA_REAPPLY_QUEUE } from "./tenant-settings.types"

@Module({
  imports: [
    BullModule.registerQueue({ name: TENANT_MAKARA_REAPPLY_QUEUE }),
    BullBoardModule.forFeature({ name: TENANT_MAKARA_REAPPLY_QUEUE, adapter: BullMQAdapter }),
    forwardRef(() => ProjectModule),
  ],
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService, MakaraReapplyProcessor],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}

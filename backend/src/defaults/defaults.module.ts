import { Global, Module } from "@nestjs/common"
import { DefaultsService } from "./defaults.service"
import { DefaultsController } from "./defaults.controller"

@Global()
@Module({
  controllers: [DefaultsController],
  providers: [DefaultsService],
  exports: [DefaultsService],
})
export class DefaultsModule {}

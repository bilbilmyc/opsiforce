import { Module } from "@nestjs/common"
import { ExternalServicesController } from "./external-services.controller"

@Module({
  controllers: [ExternalServicesController],
})
export class ExternalServicesModule {}

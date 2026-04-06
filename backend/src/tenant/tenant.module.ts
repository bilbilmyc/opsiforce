import { Global, Module } from "@nestjs/common"
import { TenantService } from "./tenant.service"
import { TenantController } from "./tenant.controller"

@Global()
@Module({
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}

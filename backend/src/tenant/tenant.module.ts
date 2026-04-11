import { Global, Module } from "@nestjs/common"
import { TenantService } from "./tenant.service"
import { TenantController } from "./tenant.controller"
import { BifrostModule } from "../bifrost/bifrost.module"

@Global()
@Module({
  imports: [BifrostModule],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}

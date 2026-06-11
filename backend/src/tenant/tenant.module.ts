import { Global, Module } from "@nestjs/common"
import { TenantService } from "./tenant.service"
import { TenantController } from "./tenant.controller"
import { BifrostModule } from "../bifrost/bifrost.module"
import { EnvironmentModule } from "../environment/environment.module"

@Global()
@Module({
  imports: [BifrostModule, EnvironmentModule],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}

import { Module } from "@nestjs/common"
import { ProxyService } from "./proxy.service"
import { ProxyController } from "./proxy.controller"
import { ProjectModule } from "../project/project.module"
import { TenantModule } from "../tenant/tenant.module"
import { AgentUpdateModule } from "../agent-update/agent-update.module"

@Module({
  imports: [ProjectModule, TenantModule, AgentUpdateModule],
  providers: [ProxyService],
  controllers: [ProxyController],
  exports: [ProxyService],
})
export class ProxyModule {}

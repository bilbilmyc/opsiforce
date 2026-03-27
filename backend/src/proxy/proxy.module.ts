import { Module } from "@nestjs/common"
import { ProxyService } from "./proxy.service"
import { ProxyController } from "./proxy.controller"
import { ProjectModule } from "../project/project.module"

@Module({
  imports: [ProjectModule],
  providers: [ProxyService],
  controllers: [ProxyController],
  exports: [ProxyService],
})
export class ProxyModule {}

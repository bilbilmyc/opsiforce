import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { PermissionController } from "./permission.controller"
import { PermissionGuard } from "./permission.guard"

@Module({
  controllers: [PermissionController],
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class PermissionModule {}

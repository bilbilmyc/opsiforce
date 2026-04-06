import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ConfigModule } from "@nestjs/config"
import configuration from "./config/configuration"
import { PodModule } from "./pod/pod.module"
import { ProjectModule } from "./project/project.module"
import { TimeoutModule } from "./timeout/timeout.module"
import { ProxyModule } from "./proxy/proxy.module"
import { UploadModule } from "./upload/upload.module"
import { TenantModule } from "./tenant/tenant.module"
import { TenantGuard } from "./tenant/tenant.guard"
import { HealthController } from "./health.controller"
import { BifrostModule } from "./bifrost/bifrost.module"
import { PermissionModule } from "./permission/permission.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TenantModule,
    PodModule,
    ProjectModule,
    TimeoutModule,
    ProxyModule,
    UploadModule,
    BifrostModule,
    PermissionModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: TenantGuard }],
})
export class AppModule {}

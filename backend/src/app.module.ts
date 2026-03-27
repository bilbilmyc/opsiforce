import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import configuration from "./config/configuration"
import { PodModule } from "./pod/pod.module"
import { ProjectModule } from "./project/project.module"
import { TimeoutModule } from "./timeout/timeout.module"
import { ProxyModule } from "./proxy/proxy.module"
import { HealthController } from "./health.controller"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PodModule,
    ProjectModule,
    TimeoutModule,
    ProxyModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

import { Module } from "@nestjs/common"
import { APP_GUARD } from "@nestjs/core"
import { ConfigModule, ConfigService } from "@nestjs/config"
import { BullModule } from "@nestjs/bullmq"
import { BullBoardModule } from "@bull-board/nestjs"
import { FastifyAdapter as BullBoardFastifyAdapter } from "@bull-board/fastify"
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
import { CleanupModule } from "./cleanup/cleanup.module"
import { GatewayModule } from "./gateway/gateway.module"
import { ScheduleModule } from "./schedule/schedule.module"
import { UserModule } from "./user/user.module"
import { DefaultsModule } from "./defaults/defaults.module"
import { WorkspaceModule } from "./workspace/workspace.module"
import { AgentModule } from "./agent/agent.module"
import { AgentUpdateModule } from "./agent-update/agent-update.module"
import { InternalAppsModule } from "./internal/apps.module"

function parseRedisUrl(url: string) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "6379", 10),
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.pathname && parsed.pathname !== "/" ? { db: parseInt(parsed.pathname.slice(1), 10) } : {}),
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.getOrThrow<string>("redisUrl")),
      }),
    }),
    BullBoardModule.forRoot({
      route: "/admin/queues",
      adapter: BullBoardFastifyAdapter,
    }),
    TenantModule,
    UserModule,
    PodModule,
    ProjectModule,
    WorkspaceModule,
    AgentModule,
    TimeoutModule,
    ProxyModule,
    UploadModule,
    BifrostModule,
    PermissionModule,
    CleanupModule,
    GatewayModule,
    ScheduleModule,
    DefaultsModule,
    AgentUpdateModule,
    InternalAppsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: TenantGuard }],
})
export class AppModule {}

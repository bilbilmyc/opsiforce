import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common"
import { ProxyService } from "./proxy.service"
import { ProxyMiddleware } from "./proxy.middleware"
import { ProxyController } from "./proxy.controller"
import { ProjectModule } from "../project/project.module"

@Module({
  imports: [ProjectModule],
  providers: [ProxyService],
  controllers: [ProxyController],
  exports: [ProxyService],
})
export class ProxyModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ProxyMiddleware).forRoutes("proxy")
  }
}

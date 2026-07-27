import "reflect-metadata"
import { NestFactory } from "@nestjs/core"
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify"
import { WsAdapter } from "@nestjs/platform-ws"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 25 * 1024 * 1024 }),
  )
  app.setGlobalPrefix("api")
  app.enableCors()
  app.useWebSocketAdapter(new WsAdapter(app))
  const port = 3100
  await app.listen(port, "0.0.0.0")
}

bootstrap()

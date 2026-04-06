import "reflect-metadata"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api")
  app.enableCors()
  const port = 3100
  await app.listen(port, "0.0.0.0")
}

bootstrap()

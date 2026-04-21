import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { requirePermissionHook } from "./permission/permission.hook";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(import("@fastify/multipart"), {
    limits: { fileSize: 100 * 1024 * 1024, files: 100 },
  });
  await fastify.register(import("@fastify/compress"), {
    encodings: ["br", "gzip", "deflate"],
    threshold: 1024,
  });

  app.setGlobalPrefix("api");

  fastify.addHook("onRequest", requirePermissionHook("/api/admin/queues", "can_view_queue_dashboard"))

  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(3001, "0.0.0.0");
}

bootstrap();

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { ProxyService } from "./proxy/proxy.service";
import { createWebappProxyServer } from "./proxy/webapp-proxy-server";
import { createVscodeProxyServer } from "./proxy/vscode-proxy-server";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const fastify = app.getHttpAdapter().getInstance();
  await fastify.register(import("@fastify/multipart"), {
    limits: { fileSize: 100 * 1024 * 1024, files: 100 },
  });

  app.setGlobalPrefix("api");

  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(3001, "0.0.0.0");

  const proxyService = app.get(ProxyService);
  const configService = app.get(ConfigService);
  const webappProxyPort = configService.get<number>("webappProxyPort", 3002);
  const vscodeProxyPort = configService.get<number>("vscodeProxyPort", 3003);
  const k8sApiProxyUrl = configService.get<string>("k8sApiProxyUrl", "");
  const k8sNamespace = configService.get<string>("k8sNamespace", "opsiforce");

  createWebappProxyServer(proxyService).listen(webappProxyPort, "0.0.0.0");
  createVscodeProxyServer(proxyService, k8sApiProxyUrl ? { namespace: k8sNamespace } : undefined)
    .listen(vscodeProxyPort, "0.0.0.0");
}

bootstrap();

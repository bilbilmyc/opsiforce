import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { ProxyService } from "./proxy/proxy.service";
import { createAppProxyServer } from "./proxy/app-proxy-server";
import { createVscodeProxyServer } from "./proxy/vscode-proxy-server";
import { ProjectService } from "./project/project.service";

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
  const projectService = app.get(ProjectService);
  const configService = app.get(ConfigService);
  const appProxyPort = configService.get<number>("appProxyPort", 3002);
  const vscodeProxyPort = configService.get<number>("vscodeProxyPort", 3003);
  const k8sApiProxyUrl = configService.get<string>("k8sApiProxyUrl", "");
  const k8sNamespace = configService.get<string>("k8sNamespace", "opsiforce");

  createAppProxyServer(proxyService, projectService).listen(appProxyPort, "0.0.0.0");
  createVscodeProxyServer(
    proxyService,
    projectService,
    k8sApiProxyUrl ? { namespace: k8sNamespace } : undefined,
  )
    .listen(vscodeProxyPort, "0.0.0.0");
}

bootstrap();

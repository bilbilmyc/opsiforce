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
import { createDbProxyServer } from "./proxy/db-proxy-server";
import { ProjectService } from "./project/project.service";
import { AppRequestLogger } from "./app-request/app-request-logger";
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

  app.setGlobalPrefix("api");

  fastify.addHook("onRequest", requirePermissionHook("/api/admin/queues", "can_view_queue_dashboard"))

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
  const dbProxyPort = configService.get<number>("dbProxyPort", 3004);
  const vscodePort = configService.get<number>("vscodePort", 8080);
  const dbViewerPort = configService.get<number>("dbViewerPort", 8081);
  const k8sApiProxyUrl = configService.get<string>("k8sApiProxyUrl", "");
  const k8sNamespace = configService.get<string>("k8sNamespace", "opsiforce");

  const storageMountPath = configService.get<string>("storageMountPath", "");
  const appRequestLogger = new AppRequestLogger(storageMountPath);
  createAppProxyServer(proxyService, projectService, appRequestLogger).listen(appProxyPort, "0.0.0.0");
  createVscodeProxyServer(
    proxyService,
    projectService,
    k8sApiProxyUrl ? { namespace: k8sNamespace, vscodePort } : { vscodePort },
  )
    .listen(vscodeProxyPort, "0.0.0.0");
  createDbProxyServer(
    proxyService,
    projectService,
    k8sApiProxyUrl ? { namespace: k8sNamespace, dbViewerPort } : { dbViewerPort },
  )
    .listen(dbProxyPort, "0.0.0.0");
}

bootstrap();

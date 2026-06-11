import { readFileSync } from "fs";
import { join } from "path";
import type { PodResources } from "../pod/pod-classes";

function parseJsonEnv<T>(env: string | undefined, fallback: T): T {
  if (!env) return fallback;
  try {
    return JSON.parse(env) as T;
  } catch {
    return fallback;
  }
}

function parseBooleanEnv(env: string | undefined, fallback: boolean): boolean {
  if (!env) return fallback;
  return env === "true" || env === "1";
}

function parseIntOrNull(env: string | undefined): number | null {
  if (env === undefined || env === "") return null;
  const parsed = parseInt(env, 10);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

function parsePodResourcesEnv(env: string | undefined): PodResources | null {
  if (!env) return null;
  try {
    const { cpuMillicores, memoryRequestMib, memoryLimitMib } = JSON.parse(
      env,
    ) as Partial<PodResources>;
    if (
      typeof cpuMillicores === "number" &&
      typeof memoryRequestMib === "number" &&
      typeof memoryLimitMib === "number"
    ) {
      return { cpuMillicores, memoryRequestMib, memoryLimitMib };
    }
    return null;
  } catch {
    return null;
  }
}

const platformVersion = JSON.parse(
  readFileSync(join(process.cwd(), "platform-version.json"), "utf8"),
).version as string;

function resolveAgentContainerImage(): string {
  if (process.env.AGENT_CONTAINER_IMAGE)
    return process.env.AGENT_CONTAINER_IMAGE;

  let imageVersion = platformVersion;
  try {
    imageVersion = JSON.parse(
      readFileSync(
        join(process.cwd(), "..", "agent-config", "agent-image-version.json"),
        "utf8",
      ),
    ).version as string;
  } catch {}

  return `opsiforce-agent:${imageVersion}`;
}

export default () => {
  return {
    databaseUrl:
      process.env.DATABASE_URL || "postgresql://localhost:5432/opsiforce",
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    k8sNamespace: process.env.K8S_NAMESPACE || "opsiforce",
    poolSizeOverride: parseIntOrNull(process.env.POOL_SIZE_OVERRIDE),
    agentContainerImage: resolveAgentContainerImage(),
    agentPort: parseInt(process.env.AGENT_PORT || "4096", 10),
    agentControlPort: parseInt(process.env.AGENT_CONTROL_PORT || "4910", 10),
    appPort: parseInt(process.env.APP_PORT || "3000", 10),
    vscodePort: parseInt(process.env.VSCODE_PORT || "8080", 10),
    dbViewerPort: parseInt(process.env.DB_VIEWER_PORT || "8081", 10),
    cephfsPvcName: process.env.CEPHFS_PVC_NAME || "opsiforce-cephfs",
    storageType: (process.env.STORAGE_TYPE || "cephfs") as
      | "cephfs"
      | "hostPath",
    agentContainerImagePullPolicy:
      process.env.AGENT_CONTAINER_IMAGE_PULL_POLICY || "IfNotPresent",
    platformVersion: platformVersion,
    podClassSmall: parsePodResourcesEnv(process.env.POD_CLASS_SMALL),
    agentNodeSelector: parseJsonEnv<Record<string, string>>(
      process.env.AGENT_NODE_SELECTOR,
      {},
    ),
    agentTolerations: parseJsonEnv<Array<Record<string, string>>>(
      process.env.AGENT_TOLERATIONS,
      [],
    ),
    agentAffinity: parseJsonEnv<Record<string, unknown>>(
      process.env.AGENT_AFFINITY,
      {},
    ),
    imagePullSecrets: parseJsonEnv<Array<{ name: string }>>(
      process.env.IMAGE_PULL_SECRETS,
      [],
    ),
    defaultAgentName: process.env.AGENT_NAME || "app-builder",
    proxyControlToken:
      process.env.PROXY_CONTROL_TOKEN || "opsiforce-local-proxy-token",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    storageMountPath: process.env.STORAGE_MOUNT_PATH || "/workspace-data",
    bifrostProxyUrl: process.env.BIFROST_PROXY_URL || "",
    bifrostPodProxyUrl:
      process.env.BIFROST_POD_PROXY_URL || process.env.BIFROST_PROXY_URL || "",
    bifrostAdminUsername: process.env.BIFROST_ADMIN_USERNAME || "",
    bifrostAdminPassword: process.env.BIFROST_ADMIN_PASSWORD || "",
    workspaceCleanupRetentionDays: 7,
    requestLogRetentionDays: parseInt(
      process.env.REQUEST_LOG_RETENTION_DAYS || "3",
      10,
    ),
    gatewayUrl:
      process.env.SERVICE_GATEWAY_URL ||
      "http://opsiforce-backend:3001/api/gateway",
    agentWorkspaceUpdateOnStartup: parseBooleanEnv(
      process.env.AGENT_WORKSPACE_UPDATE_ON_STARTUP,
      true,
    ),
    agentUpdateJobTimeoutMs: parseInt(
      process.env.AGENT_UPDATE_JOB_TIMEOUT_MS || "1800000",
      10,
    ),
    mailgunApiKey: process.env.MAILGUN_API_KEY || "",
    mailgunDomain: process.env.MAILGUN_DOMAIN || "",
    mailgunSender: process.env.MAILGUN_SENDER || "",
    mailgunUrl: process.env.MAILGUN_URL || "",
    appsHostname: process.env.APPS_HOSTNAME || "apps.opsiforce.localtest.me",
    webappServiceName: process.env.WEBAPP_SERVICE_NAME || "proxy-app",
    webappServicePort: parseInt(process.env.WEBAPP_SERVICE_PORT || "3002", 10),
    oidcPluginSecret:
      process.env.OIDC_PLUGIN_SECRET || "opsiforcedev0123456789abcdef1234",
    makaraOidcClientId: process.env.MAKARA_OIDC_CLIENT_ID || "opsiforce-apps",
    makaraOidcClientSecret: process.env.MAKARA_OIDC_CLIENT_SECRET || "",
    makaraOidcIssuerUrl:
      process.env.MAKARA_OIDC_ISSUER_URL ||
      "http://sima-keycloak-local-service.local.svc:8086/realms/sima",
  };
};

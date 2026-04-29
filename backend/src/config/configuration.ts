import { readFileSync } from "fs"
import { join } from "path"

function parseJsonEnv<T>(env: string | undefined, fallback: T): T {
  if (!env) return fallback
  try {
    return JSON.parse(env) as T
  } catch {
    return fallback
  }
}

const platformVersion = JSON.parse(
  readFileSync(join(process.cwd(), "platform-version.json"), "utf8"),
).version as string

function resolveAgentImage(): string {
  if (process.env.AGENT_IMAGE) return process.env.AGENT_IMAGE

  let agentImageVersion = platformVersion
  try {
    agentImageVersion = JSON.parse(
      readFileSync(join(process.cwd(), "..", "agent-config", "agent-image-version.json"), "utf8"),
    ).version as string
  } catch {}

  return `opsiforce-agent:${agentImageVersion}`
}

export default () => {
  return {
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/opsiforce",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  k8sNamespace: process.env.K8S_NAMESPACE || "opsiforce",
  warmPoolSize: parseInt(process.env.WARM_POOL_SIZE || "2", 10),
  agentImage: resolveAgentImage(),
  agentPort: parseInt(process.env.AGENT_PORT || "4096", 10),
  appPort: parseInt(process.env.APP_PORT || "3000", 10),
  vscodePort: parseInt(process.env.VSCODE_PORT || "8080", 10),
  dbViewerPort: parseInt(process.env.DB_VIEWER_PORT || "8081", 10),
  cephfsPvcName: process.env.CEPHFS_PVC_NAME || "opsiforce-cephfs",
  storageType: (process.env.STORAGE_TYPE || "cephfs") as "cephfs" | "hostPath",
  agentImagePullPolicy: process.env.AGENT_IMAGE_PULL_POLICY || "IfNotPresent",
  platformVersion: platformVersion,
  agentResources: parseJsonEnv(process.env.AGENT_RESOURCES, {
    requests: { cpu: "200m", memory: "1312Mi" },
    limits: { memory: "2Gi" },
  }),
  agentNodeSelector: parseJsonEnv<Record<string, string>>(process.env.AGENT_NODE_SELECTOR, {}),
  agentTolerations: parseJsonEnv<Array<Record<string, string>>>(process.env.AGENT_TOLERATIONS, []),
  agentAffinity: parseJsonEnv<Record<string, unknown>>(process.env.AGENT_AFFINITY, {}),
  imagePullSecrets: parseJsonEnv<Array<{ name: string }>>(process.env.IMAGE_PULL_SECRETS, []),
  defaultAgentName: process.env.AGENT_NAME || "app-builder",
  proxyControlToken: process.env.PROXY_CONTROL_TOKEN || "opsiforce-local-proxy-token",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  storageMountPath: process.env.STORAGE_MOUNT_PATH || "/workspace-data",
  bifrostProxyUrl: process.env.BIFROST_PROXY_URL || "",
  bifrostPodProxyUrl: process.env.BIFROST_POD_PROXY_URL || process.env.BIFROST_PROXY_URL || "",
  bifrostAdminUsername: process.env.BIFROST_ADMIN_USERNAME || "",
  bifrostAdminPassword: process.env.BIFROST_ADMIN_PASSWORD || "",
  workspaceCleanupRetentionDays: 7,
  requestLogRetentionDays: parseInt(process.env.REQUEST_LOG_RETENTION_DAYS || "3", 10),
  gatewayUrl: process.env.SERVICE_GATEWAY_URL || "http://opsiforce-backend:3001/api/gateway",
  mailgunApiKey: process.env.MAILGUN_API_KEY || "",
  mailgunDomain: process.env.MAILGUN_DOMAIN || "",
  mailgunSender: process.env.MAILGUN_SENDER || "",
  mailgunUrl: process.env.MAILGUN_URL || "",
  appsHostname: process.env.APPS_HOSTNAME || "apps.opsiforce.traefik.me",
  webappServiceName: process.env.WEBAPP_SERVICE_NAME || "proxy-app",
  webappServiceNamespace: process.env.WEBAPP_SERVICE_NAMESPACE || "local",
  webappServicePort: parseInt(process.env.WEBAPP_SERVICE_PORT || "3002", 10),
  oidcPluginSecret: process.env.OIDC_PLUGIN_SECRET || "opsiforcedev0123456789abcdef1234",
  makaraOidcClientId: process.env.MAKARA_OIDC_CLIENT_ID || "opsiforce-apps",
  makaraOidcClientSecret: process.env.MAKARA_OIDC_CLIENT_SECRET || "",
  makaraOidcIssuerUrl:
    process.env.MAKARA_OIDC_ISSUER_URL ||
    "http://sima-keycloak-local-service.local.svc:8086/realms/sima",
}}

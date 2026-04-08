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

let agentImageVersion = platformVersion
try {
  agentImageVersion = JSON.parse(
    readFileSync(join(process.cwd(), "..", "agent-config", "agent-image-version.json"), "utf8"),
  ).version
} catch {}

const DEFAULT_TIMEOUT_IDLE = 30 * 60 * 1000
const DEFAULT_APP_TIMEOUT_IDLE = 7 * 24 * 60 * 60 * 1000

export default () => {
  return {
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/opsiforce",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  k8sNamespace: process.env.K8S_NAMESPACE || "opsiforce",
  warmPoolSize: parseInt(process.env.WARM_POOL_SIZE || "2", 10),
  agentImage: process.env.AGENT_IMAGE || `opsiforce-agent:${agentImageVersion}`,
  agentPort: parseInt(process.env.AGENT_PORT || "4096", 10),
  appPort: parseInt(process.env.APP_PORT || "3000", 10),
  vscodePort: parseInt(process.env.VSCODE_PORT || "8080", 10),
  k8sApiProxyUrl: process.env.K8S_API_PROXY_URL || "",
  cephfsPvcName: process.env.CEPHFS_PVC_NAME || "opsiforce-cephfs",
  storageType: (process.env.STORAGE_TYPE || "cephfs") as "cephfs" | "hostPath",
  storageHostPath: process.env.STORAGE_HOST_PATH || "/tmp/opsiforce-data",
  agentImagePullPolicy: process.env.AGENT_IMAGE_PULL_POLICY || "IfNotPresent",
  platformVersion: platformVersion,
  agentResources: parseJsonEnv(process.env.AGENT_RESOURCES, {
    requests: { cpu: "200m", memory: "512Mi" },
    limits: { memory: "2Gi" },
  }),
  agentNodeSelector: parseJsonEnv<Record<string, string>>(process.env.AGENT_NODE_SELECTOR, {}),
  agentTolerations: parseJsonEnv<Array<Record<string, string>>>(process.env.AGENT_TOLERATIONS, []),
  agentAffinity: parseJsonEnv<Record<string, unknown>>(process.env.AGENT_AFFINITY, {}),
  imagePullSecrets: parseJsonEnv<Array<{ name: string }>>(process.env.IMAGE_PULL_SECRETS, []),
  defaultAgentName: process.env.AGENT_NAME || "app-builder",
  appProxyPort: parseInt(process.env.APP_PROXY_PORT || "3002", 10),
  vscodeProxyPort: parseInt(process.env.VSCODE_PROXY_PORT || "3003", 10),
  defaultTimeoutIdle: DEFAULT_TIMEOUT_IDLE,
  defaultAppTimeoutIdle: DEFAULT_APP_TIMEOUT_IDLE,
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  storageMountPath: process.env.STORAGE_MOUNT_PATH || "/tmp/opsiforce-data",
  bifrostProxyUrl: process.env.BIFROST_PROXY_URL || "",
  bifrostPodProxyUrl: process.env.BIFROST_POD_PROXY_URL || process.env.BIFROST_PROXY_URL || "",
  bifrostAdminUsername: process.env.BIFROST_ADMIN_USERNAME || "",
  bifrostAdminPassword: process.env.BIFROST_ADMIN_PASSWORD || "",
}}

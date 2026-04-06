function parseJsonEnv<T>(env: string | undefined, fallback: T): T {
  if (!env) return fallback
  try {
    return JSON.parse(env) as T
  } catch {
    return fallback
  }
}

export default () => {
  const platformVersion = process.env.PLATFORM_VERSION || require("../../../agent-config/agent-version.json").version
  return {
  databaseUrl: process.env.DATABASE_URL || "postgresql://localhost:5432/opsiforce",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  k8sNamespace: process.env.K8S_NAMESPACE || "opsiforce",
  warmPoolSize: parseInt(process.env.WARM_POOL_SIZE || "2", 10),
  agentImage: process.env.AGENT_IMAGE || `opsiforce-agent:${platformVersion}`,
  agentPort: parseInt(process.env.AGENT_PORT || "4096", 10),
  webappPort: parseInt(process.env.WEBAPP_PORT || "3101", 10),
  vscodePort: parseInt(process.env.VSCODE_PORT || "8080", 10),
  k8sApiProxyUrl: process.env.K8S_API_PROXY_URL || "",
  cephfsPvcName: process.env.CEPHFS_PVC_NAME || "opsiforce-cephfs",
  storageType: (process.env.STORAGE_TYPE || "cephfs") as "cephfs" | "hostPath",
  storageHostPath: process.env.STORAGE_HOST_PATH || "/tmp/opsiforce-data",
  agentImagePullPolicy: process.env.AGENT_IMAGE_PULL_POLICY || "IfNotPresent",
  timeoutIdleMinutes: parseInt(process.env.TIMEOUT_IDLE_MINUTES || "30", 10),
  appTimeoutIdleMinutes: parseInt(process.env.APP_TIMEOUT_IDLE_MINUTES || "10080", 10),
  platformVersion,
  agentResources: parseJsonEnv(process.env.AGENT_RESOURCES, {
    requests: { cpu: "200m", memory: "512Mi" },
    limits: { memory: "2Gi" },
  }),
  agentNodeSelector: parseJsonEnv<Record<string, string>>(process.env.AGENT_NODE_SELECTOR, {}),
  agentTolerations: parseJsonEnv<Array<Record<string, string>>>(process.env.AGENT_TOLERATIONS, []),
  agentAffinity: parseJsonEnv<Record<string, unknown>>(process.env.AGENT_AFFINITY, {}),
  imagePullSecrets: parseJsonEnv<Array<{ name: string }>>(process.env.IMAGE_PULL_SECRETS, []),
  defaultAgentName: process.env.AGENT_NAME || "app-builder",
  webappProxyPort: parseInt(process.env.WEBAPP_PROXY_PORT || "3002", 10),
  vscodeProxyPort: parseInt(process.env.VSCODE_PROXY_PORT || "3003", 10),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  storageMountPath: process.env.STORAGE_MOUNT_PATH || "/tmp/opsiforce-data",
  bifrostProxyUrl: process.env.BIFROST_PROXY_URL || "",
  bifrostPodProxyUrl: process.env.BIFROST_POD_PROXY_URL || process.env.BIFROST_PROXY_URL || "",
  bifrostMasterKey: process.env.BIFROST_MASTER_KEY || "",
}}

import * as k8s from "@kubernetes/client-node"

export interface PodTemplateOptions {
  podName: string
  namespace: string
  agentImage: string
  agentPort: number
  storageType: "cephfs" | "hostPath"
  cephfsPvcName: string
  storageHostPath: string
  subPath?: string
  projectId?: string
  imagePullPolicy: string
  resources?: Record<string, unknown>
  nodeSelector?: Record<string, string>
  tolerations?: Array<Record<string, string>>
  affinity?: Record<string, unknown>
  imagePullSecrets?: Array<{ name: string }>
  openaiApiKey?: string
  agentName?: string
  bifrostProxyUrl?: string
  bifrostApiKey?: string
  bifrostBackendApiKey?: string
}

export function buildPodSpec(options: PodTemplateOptions): k8s.V1Pod {
  const isAssigned = !!options.projectId

  const volumeMounts: k8s.V1VolumeMount[] = [
    {
      name: "workspace",
      mountPath: "/workspace",
      ...(options.subPath ? { subPath: options.subPath } : {}),
    },
  ]

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: options.podName,
      namespace: options.namespace,
      labels: {
        app: "opsiforce-agent",
        "opsiforce.io/pool": isAssigned ? "assigned" : "warm",
        ...(options.projectId ? { "opsiforce.io/project-id": options.projectId } : {}),
      },
    },
    spec: {
      ...(options.nodeSelector && Object.keys(options.nodeSelector).length > 0
        ? { nodeSelector: options.nodeSelector }
        : {}),
      ...(options.tolerations && options.tolerations.length > 0
        ? { tolerations: options.tolerations }
        : {}),
      ...(options.affinity && Object.keys(options.affinity).length > 0
        ? { affinity: options.affinity }
        : {}),
      ...(options.imagePullSecrets && options.imagePullSecrets.length > 0
        ? { imagePullSecrets: options.imagePullSecrets }
        : {}),
      initContainers: [
        {
          name: "init-config",
          image: options.agentImage,
          imagePullPolicy: options.imagePullPolicy,
          command: [
            "sh", "-c",
            `AGENT="\${AGENT_NAME:-app-builder}"; ` +
            "mkdir -p /workspace/.xdg/config/opencode /workspace/.xdg/code-server /workspace/.opencode/agents; " +
            "cp -n /opt/opencode/opencode.json /workspace/.xdg/config/opencode/opencode.json; " +
            "cp -n /opt/agents/$AGENT/agent.md /workspace/.opencode/agents/$AGENT.md; " +
            "if [ ! -d /workspace/app ]; then " +
            "cp -r /opt/agents/$AGENT/template/. /workspace/; " +
            "cd /workspace && printf '.config/\\n.cache/\\n.bun/\\n.opencode/\\n.xdg/\\nnode_modules/\\ndata/\\n' > .gitignore && " +
            "git init && git config user.email 'agent@opsiforce.com' && git config user.name 'OpsiForce' && git add -A && git commit -m 'Initial template'; " +
            "fi",
          ],
          volumeMounts,
        },
      ],
      containers: [
        {
          name: "opencode",
          image: options.agentImage,
          imagePullPolicy: options.imagePullPolicy,
          workingDir: "/workspace",
          ports: [
            { containerPort: options.agentPort },
            { containerPort: 3000 },
            { containerPort: 8080 },
          ],
          env: [
            { name: "XDG_DATA_HOME", value: "/workspace/.xdg/share" },
            { name: "XDG_CONFIG_HOME", value: "/workspace/.xdg/config" },
            { name: "XDG_CACHE_HOME", value: "/workspace/.xdg/cache" },
            { name: "XDG_STATE_HOME", value: "/workspace/.xdg/state" },
            { name: "AGENT_NAME", value: options.agentName || "app-builder" },
            ...(options.bifrostApiKey && options.bifrostProxyUrl
              ? [
                  { name: "OPENAI_API_KEY", value: options.bifrostApiKey },
                  { name: "OPENAI_BASE_URL", value: options.bifrostProxyUrl },
                  ...(options.bifrostBackendApiKey
                    ? [
                        { name: "APP_LLM_API_KEY", value: options.bifrostBackendApiKey },
                        { name: "APP_LLM_BASE_URL", value: options.bifrostProxyUrl },
                      ]
                    : []),
                ]
              : options.openaiApiKey
                ? [{ name: "OPENAI_API_KEY", value: options.openaiApiKey }]
                : []),
          ],
          volumeMounts,
          readinessProbe: {
            httpGet: {
              path: "/global/health",
              port: options.agentPort,
            },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
          resources: options.resources ?? {
            requests: { cpu: "200m", memory: "512Mi" },
            limits: { memory: "2Gi" },
          },
        },
      ],
      volumes: [buildStorageVolume(options)],
      restartPolicy: "Always",
    },
  }
}

function buildStorageVolume(options: PodTemplateOptions): k8s.V1Volume {
  if (options.storageType === "hostPath") {
    return {
      name: "workspace",
      hostPath: {
        path: options.storageHostPath,
        type: "DirectoryOrCreate",
      },
    }
  }

  return {
    name: "workspace",
    persistentVolumeClaim: {
      claimName: options.cephfsPvcName,
    },
  }
}

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
            "cp -n /opt/opencode/AGENTS.md /workspace/AGENTS.md; " +
            "mkdir -p /workspace/.xdg/config/opencode; " +
            "cp -n /opt/opencode/opencode.json /workspace/.xdg/config/opencode/opencode.json",
          ],
          volumeMounts,
        },
      ],
      containers: [
        {
          name: "opencode",
          image: options.agentImage,
          imagePullPolicy: options.imagePullPolicy,
          command: ["opencode", "serve", "--port", String(options.agentPort), "--hostname", "0.0.0.0"],
          workingDir: "/workspace",
          ports: [{ containerPort: options.agentPort }],
          env: [
            { name: "XDG_DATA_HOME", value: "/workspace/.xdg/share" },
            { name: "XDG_CONFIG_HOME", value: "/workspace/.xdg/config" },
            { name: "XDG_CACHE_HOME", value: "/workspace/.xdg/cache" },
            { name: "XDG_STATE_HOME", value: "/workspace/.xdg/state" },
            ...(options.openaiApiKey
              ? [{ name: "OPENAI_API_KEY", value: options.openaiApiKey }]
              : []),
          ],
          volumeMounts,
          readinessProbe: {
            httpGet: {
              path: "/global/health",
              port: options.agentPort,
            },
            initialDelaySeconds: 3,
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

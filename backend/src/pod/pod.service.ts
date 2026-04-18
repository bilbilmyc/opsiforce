import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as k8s from "@kubernetes/client-node"
import { buildPodSpec, PodTemplateOptions } from "./pod.template"

export interface TenantPodOptions {
  bifrostApiKey?: string
  bifrostBackendApiKey?: string
  bifrostProxyUrl?: string
}

@Injectable()
export class PodService {
  private readonly coreApi: k8s.CoreV1Api
  private readonly logger = new Logger(PodService.name)
  private readonly namespace: string

  constructor(private readonly configService: ConfigService) {
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    this.coreApi = kc.makeApiClient(k8s.CoreV1Api)
    this.namespace = this.configService.getOrThrow<string>("k8sNamespace")
  }

  private baseOptions(podName: string): PodTemplateOptions {
    return {
      podName,
      namespace: this.namespace,
      agentImage: this.configService.getOrThrow<string>("agentImage"),
      agentPort: this.configService.getOrThrow<number>("agentPort"),
      storageType: this.configService.getOrThrow<"cephfs" | "hostPath">("storageType"),
      cephfsPvcName: this.configService.getOrThrow<string>("cephfsPvcName"),
      storageHostPath: this.configService.getOrThrow<string>("storageHostPath"),
      imagePullPolicy: this.configService.getOrThrow<string>("agentImagePullPolicy"),
      resources: this.configService.get("agentResources"),
      nodeSelector: this.configService.get("agentNodeSelector"),
      tolerations: this.configService.get("agentTolerations"),
      affinity: this.configService.get("agentAffinity"),
      imagePullSecrets: this.configService.get("imagePullSecrets"),
      openaiApiKey: this.configService.get("openaiApiKey"),
    }
  }

  assignedPodName(projectId: string): string {
    return `opsiforce-agent-${projectId.slice(0, 8)}`
  }

  async createWarmPod(podName: string): Promise<k8s.V1Pod> {
    const options = this.baseOptions(podName)

    const spec = buildPodSpec(options)
    const response = await this.coreApi.createNamespacedPod({
      namespace: this.namespace,
      body: spec,
    })
    return response
  }

  async createAssignedPod(projectId: string, directory: string, tenantOptions?: TenantPodOptions, sourceDir?: string): Promise<{ podName: string }> {
    const podName = this.assignedPodName(projectId)

    await this.waitForPodDeletion(podName)

    const options: PodTemplateOptions = {
      ...this.baseOptions(podName),
      subPath: directory,
      projectId,
      ...tenantOptions,
      ...(sourceDir ? { sourceDir } : {}),
    }

    const spec = buildPodSpec(options)
    await this.coreApi.createNamespacedPod({
      namespace: this.namespace,
      body: spec,
    })

    this.logger.log(`Created assigned pod ${podName} for project ${projectId}`)
    return { podName }
  }

  private async waitForPodDeletion(podName: string, timeoutMs = 30000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        await this.getPod(podName)
        await new Promise((r) => setTimeout(r, 1000))
      } catch {
        return
      }
    }

    throw new Error(`Pod ${podName} was not deleted after ${timeoutMs}ms`)
  }

  async deletePod(podName: string): Promise<void> {
    await this.coreApi.deleteNamespacedPod({
      name: podName,
      namespace: this.namespace,
    })
  }

  async waitForReady(podName: string, timeoutMs = 180 * 1000): Promise<string> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const pod = await this.getPod(podName)
        const ready = pod.status?.conditions?.find(
          (c) => c.type === "Ready" && c.status === "True",
        )
        if (ready && pod.status?.podIP) {
          return pod.status.podIP
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`Pod ${podName} not ready after ${timeoutMs}ms`)
  }

  async listPods(labelSelector?: string): Promise<k8s.V1Pod[]> {
    const response = await this.coreApi.listNamespacedPod({
      namespace: this.namespace,
      labelSelector,
    })
    return response.items
  }

  async getPod(podName: string): Promise<k8s.V1Pod> {
    return this.coreApi.readNamespacedPod({
      name: podName,
      namespace: this.namespace,
    })
  }

  async getPodIp(podName: string): Promise<string | undefined> {
    const pod = await this.getPod(podName)
    return pod.status?.podIP
  }

  isPodReady(pod: k8s.V1Pod): boolean {
    return !!pod.status?.conditions?.find(
      (condition) => condition.type === "Ready" && condition.status === "True",
    )
  }
}

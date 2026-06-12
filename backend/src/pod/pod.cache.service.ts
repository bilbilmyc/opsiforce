import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import * as k8s from "@kubernetes/client-node"
import { loadKubeConfig } from "../common/k8s-client"

const POD_LABEL_SELECTOR = "app=opsiforce-agent"
const RECONNECT_BACKOFF_MS = 5000

type PodEventHandler = (pod: k8s.V1Pod) => void
type PodDeleteHandler = (podName: string, pod: k8s.V1Pod) => void
type PodInformer = k8s.Informer<k8s.V1Pod> & {
  get(name: string, namespace?: string): k8s.V1Pod | undefined
  list(namespace?: string): ReadonlyArray<k8s.V1Pod>
}

@Injectable()
export class PodCacheService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PodCacheService.name)
  private readonly kc: k8s.KubeConfig
  private readonly coreApi: k8s.CoreV1Api
  private readonly namespace: string
  private informer: PodInformer | null = null

  private readonly addHandlers = new Set<PodEventHandler>()
  private readonly updateHandlers = new Set<PodEventHandler>()
  private readonly deleteHandlers = new Set<PodDeleteHandler>()

  private synced = false
  private syncedPromise: Promise<void>
  private resolveSynced: (() => void) | null = null
  private stopping = false
  private starting = false
  private startFailed = false
  private reconnectTimer: NodeJS.Timeout | null = null

  constructor(private readonly configService: ConfigService) {
    this.kc = loadKubeConfig()
    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api)
    this.namespace = this.configService.getOrThrow<string>("k8sNamespace")
    this.syncedPromise = Promise.resolve()
    this.resetSync()
  }

  async onApplicationBootstrap() {
    void this.start().catch((err) => {
      this.logger.warn(`Pod informer initial start failed: ${(err as Error).message}`)
    })
  }

  async onModuleDestroy() {
    this.stopping = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.informer) {
      await this.informer.stop().catch(() => {})
    }
  }

  private async start(): Promise<void> {
    if (this.starting || this.stopping) return
    this.starting = true
    this.startFailed = false
    this.resetSync()

    const path = `/api/v1/namespaces/${this.namespace}/pods`
    const listFn = () =>
      this.coreApi.listNamespacedPod({
        namespace: this.namespace,
        labelSelector: POD_LABEL_SELECTOR,
      })

    const informer = k8s.makeInformer(this.kc, path, listFn, POD_LABEL_SELECTOR)
    this.informer = informer

    informer.on("add", (pod) => this.handleAdd(pod))
    informer.on("update", (pod) => this.handleUpdate(pod))
    informer.on("delete", (pod) => this.handleDelete(pod))
    informer.on("error", (err) => this.handleError(err))

    try {
      await informer.start()
      if (!this.startFailed && !this.stopping) {
        this.markSynced()
        this.logger.log(`Pod informer started (namespace=${this.namespace}, labelSelector=${POD_LABEL_SELECTOR})`)
      }
    } catch (err) {
      this.logger.warn(`Pod informer failed to start: ${(err as Error).message}; retrying in ${RECONNECT_BACKOFF_MS}ms`)
      this.scheduleReconnect()
    } finally {
      this.starting = false
    }

    if (this.startFailed && !this.stopping) {
      this.scheduleReconnect()
    }
  }

  async waitForSync(): Promise<void> {
    return this.syncedPromise
  }

  async waitForSyncWithTimeout(timeoutMs: number): Promise<boolean> {
    if (this.synced) return true
    let timer: NodeJS.Timeout | null = null
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    const synced = this.syncedPromise.then(() => true as const)
    const result = await Promise.race([synced, timeout])
    if (timer) clearTimeout(timer)
    return result
  }

  isSynced(): boolean {
    return this.synced
  }

  getPod(name: string): k8s.V1Pod | undefined {
    return this.informer?.get(name, this.namespace)
  }

  listPods(): k8s.V1Pod[] {
    return this.informer ? Array.from(this.informer.list(this.namespace)) : []
  }

  onAdd(handler: PodEventHandler): () => void {
    this.addHandlers.add(handler)
    return () => {
      this.addHandlers.delete(handler)
    }
  }

  onUpdate(handler: PodEventHandler): () => void {
    this.updateHandlers.add(handler)
    return () => {
      this.updateHandlers.delete(handler)
    }
  }

  onDelete(handler: PodDeleteHandler): () => void {
    this.deleteHandlers.add(handler)
    return () => {
      this.deleteHandlers.delete(handler)
    }
  }

  private handleAdd(pod: k8s.V1Pod): void {
    const name = pod.metadata?.name
    if (!name) return
    this.addHandlers.forEach((h) => {
      try {
        h(pod)
      } catch (err) {
        this.logger.warn(`Pod add handler threw: ${(err as Error).message}`)
      }
    })
  }

  private handleUpdate(pod: k8s.V1Pod): void {
    const name = pod.metadata?.name
    if (!name) return
    this.updateHandlers.forEach((h) => {
      try {
        h(pod)
      } catch (err) {
        this.logger.warn(`Pod update handler threw: ${(err as Error).message}`)
      }
    })
  }

  private handleDelete(pod: k8s.V1Pod): void {
    const name = pod.metadata?.name
    if (!name) return
    this.deleteHandlers.forEach((h) => {
      try {
        h(name, pod)
      } catch (err) {
        this.logger.warn(`Pod delete handler threw: ${(err as Error).message}`)
      }
    })
  }

  private handleError(err?: Error): void {
    if (this.stopping) return
    this.startFailed = true
    this.logger.warn(`Pod informer error: ${err?.message ?? "unknown error"}; reconnecting in ${RECONNECT_BACKOFF_MS}ms`)
    this.scheduleReconnect()
  }

  private markSynced(): void {
    if (this.synced) return
    this.synced = true
    this.resolveSynced?.()
    this.resolveSynced = null
  }

  private resetSync(): void {
    if (!this.synced && this.resolveSynced) return
    this.synced = false
    this.syncedPromise = new Promise((resolve) => {
      this.resolveSynced = resolve
    })
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.reconnectTimer) return
    this.resetSync()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.restart().catch((err) => {
        this.logger.warn(`Pod informer restart failed: ${(err as Error).message}`)
      })
    }, RECONNECT_BACKOFF_MS)
  }

  private async restart(): Promise<void> {
    if (this.stopping) return
    await this.informer?.stop().catch(() => {})
    await this.start()
  }
}

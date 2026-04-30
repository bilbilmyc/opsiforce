import { Inject, Injectable, Logger, OnModuleDestroy, forwardRef } from "@nestjs/common"
import { ProxyService } from "../proxy/proxy.service"
import { ProjectEventsService } from "./project-events.service"
import { ProjectService } from "./project.service"
import { ProjectStatus, type ProjectAppMeta } from "./project.types"

const FETCH_TIMEOUT_MS = 5000
const POLL_INTERVAL_MS = 3000
const READY_TTL_MS = 30000
const MAX_CONSECUTIVE_FAILURES = 60

interface CacheEntry {
  value: ProjectAppMeta
  fetchedAt: number
}

@Injectable()
export class AppService implements OnModuleDestroy {
  private readonly logger = new Logger(AppService.name)
  private readonly cache = new Map<string, CacheEntry>()
  private readonly pollers = new Map<string, NodeJS.Timeout>()
  private readonly failureCounts = new Map<string, number>()

  constructor(
    @Inject(forwardRef(() => ProjectService))
    private readonly projectService: ProjectService,
    private readonly proxyService: ProxyService,
    private readonly projectEventsService: ProjectEventsService,
  ) {}

  onModuleDestroy(): void {
    for (const timer of this.pollers.values()) clearInterval(timer)
    this.pollers.clear()
  }

  get(projectId: string): ProjectAppMeta | null {
    const entry = this.cache.get(projectId)
    if (!entry) return null
    if (entry.value.exists && Date.now() - entry.fetchedAt > READY_TTL_MS) {
      this.cache.delete(projectId)
      return null
    }
    return entry.value
  }

  invalidate(projectId: string): void {
    this.cache.delete(projectId)
    this.failureCounts.delete(projectId)
  }

  startPolling(projectId: string): void {
    if (this.pollers.has(projectId)) return
    void this.refresh(projectId)
    const timer = setInterval(() => {
      void this.refresh(projectId)
    }, POLL_INTERVAL_MS)
    this.pollers.set(projectId, timer)
  }

  stopPolling(projectId: string): void {
    const timer = this.pollers.get(projectId)
    if (!timer) return
    clearInterval(timer)
    this.pollers.delete(projectId)
    this.failureCounts.delete(projectId)
  }

  private async refresh(projectId: string): Promise<void> {
    const cached = this.cache.get(projectId)
    if (cached?.value.exists) {
      this.stopPolling(projectId)
      return
    }

    const failures = this.failureCounts.get(projectId) ?? 0
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      this.stopPolling(projectId)
      return
    }

    let project
    try {
      project = await this.projectService.findOneById(projectId)
    } catch {
      this.stopPolling(projectId)
      return
    }

    if (project.status !== ProjectStatus.Active || !project.podIp) {
      this.stopPolling(projectId)
      return
    }

    const next = await this.fetchAppMeta(project)
    if (!next) {
      this.failureCounts.set(projectId, failures + 1)
      return
    }

    this.failureCounts.delete(projectId)
    const previous = cached?.value
    this.cache.set(projectId, { value: next, fetchedAt: Date.now() })

    if (!previous || !appMetaEquals(previous, next)) {
      await this.projectEventsService.publish(projectId)
    }

    if (next.exists) this.stopPolling(projectId)
  }

  private async fetchAppMeta(project: {
    id: string
    podName: string | null
    podIp: string | null
  }): Promise<ProjectAppMeta | null> {
    const upstream = this.proxyService.resolveAppUpstreamForProject(project)
    try {
      const response = await fetch(`${upstream}/api/app-meta`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!response.ok) return { exists: false, name: null, description: null }
      const payload: unknown = await response.json()
      return parseAppMeta(payload)
    } catch (err) {
      this.logger.debug(
        `app-meta fetch failed for project ${project.id}: ${(err as Error).message}`,
      )
      return null
    }
  }
}

function parseAppMeta(payload: unknown): ProjectAppMeta {
  if (!payload || typeof payload !== "object") {
    return { exists: false, name: null, description: null }
  }
  const record = payload as Record<string, unknown>
  const exists = record.exists === true
  const name = typeof record.name === "string" ? record.name : null
  const description = typeof record.description === "string" ? record.description : null
  return { exists, name, description }
}

function appMetaEquals(a: ProjectAppMeta, b: ProjectAppMeta): boolean {
  return a.exists === b.exists && a.name === b.name && a.description === b.description
}

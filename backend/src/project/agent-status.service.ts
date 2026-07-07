import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ProjectEnvironmentService } from '../project-environment/project-environment.service';
import type { ProjectEnvironmentContext } from '../project-environment/project-environment.types';
import { ProxyService } from '../proxy/proxy.service';
import { ProjectEventsService } from './project-events.service';
import { AgentStatus, ProjectStatus } from './project.types';

const RECONCILE_PROBE_TIMEOUT_MS = 3 * 1000;
const RECONCILE_RETRY_BASE_MS = 5 * 1000;
const RECONCILE_RETRY_MAX_MS = 60 * 1000;

const isWorkingStatus = (sessionStatusType: string | undefined): boolean =>
  sessionStatusType === 'busy' || sessionStatusType === 'retry';

@Injectable()
export class AgentStatusService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AgentStatusService.name);
  private readonly workingByProject = new Map<string, Set<string>>();
  private readonly reconcileRetries = new Map<string, number>();
  private readonly reconcileTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly projectEvents: ProjectEventsService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly proxyService: ProxyService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.reconcile().catch((err) => {
      this.logger.warn(`Agent status boot reconcile failed: ${(err as Error).message}`);
    });
  }

  onModuleDestroy(): void {
    for (const timer of this.reconcileTimers.values()) {
      clearTimeout(timer);
    }
    this.reconcileTimers.clear();
    this.reconcileRetries.clear();
  }

  private async reconcile(): Promise<void> {
    const envs = (await this.projectEnvironmentService.listByStatus(ProjectStatus.Active)).filter(
      (env) => !env.disabled && env.podIp
    );
    if (envs.length === 0) return;

    const results = await Promise.allSettled(envs.map((env) => this.reconcileEnvironment(env)));
    const working = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    const failed = results.filter((result) => result.status === 'rejected').length;
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') this.scheduleReconcileRetry(envs[index].id);
    }
    this.logger.log(
      `Agent status reconciled across ${envs.length} active environment(s); ${working} working; ${failed} retrying`
    );
  }

  private async reconcileEnvironment(env: ProjectEnvironmentContext): Promise<boolean> {
    const upstream = this.proxyService.resolveUpstreamForProject(env);
    const res = await fetch(`${upstream}/session/status`, {
      signal: AbortSignal.timeout(RECONCILE_PROBE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`status snapshot returned ${res.status}`);

    const sessions = (await res.json()) as Record<string, { type?: string }>;
    const working = Object.values(sessions).some((session) => isWorkingStatus(session.type));
    if (working) this.setWorking(env.projectId, env.id, true);
    return working;
  }

  private scheduleReconcileRetry(envId: string): void {
    if (this.reconcileTimers.has(envId)) return;
    const attempts = (this.reconcileRetries.get(envId) ?? 0) + 1;
    this.reconcileRetries.set(envId, attempts);
    const delay = Math.min(RECONCILE_RETRY_BASE_MS * Math.pow(2, attempts - 1), RECONCILE_RETRY_MAX_MS);
    const timer = setTimeout(() => {
      this.reconcileTimers.delete(envId);
      void this.retryReconcileEnvironment(envId);
    }, delay);
    this.reconcileTimers.set(envId, timer);
  }

  private async retryReconcileEnvironment(envId: string): Promise<void> {
    const env = await this.projectEnvironmentService.findByIdOrNull(envId).catch(() => null);
    if (!env || env.disabled || env.status !== ProjectStatus.Active || !env.podIp) {
      this.reconcileRetries.delete(envId);
      return;
    }

    try {
      await this.reconcileEnvironment(env);
      this.reconcileRetries.delete(envId);
    } catch (err) {
      this.logger.warn(`Agent status reconcile retry failed for ${envId}: ${(err as Error).message}`);
      this.scheduleReconcileRetry(envId);
    }
  }

  setWorking(projectId: string, environmentId: string, isWorking: boolean): void {
    const before = this.statusOf(projectId);

    if (isWorking) {
      const keys = this.workingByProject.get(projectId) ?? new Set<string>();
      keys.add(environmentId);
      this.workingByProject.set(projectId, keys);
    } else {
      const keys = this.workingByProject.get(projectId);
      if (keys) {
        keys.delete(environmentId);
        if (keys.size === 0) this.workingByProject.delete(projectId);
      }
    }

    if (this.statusOf(projectId) !== before) {
      void this.projectEvents.publish(projectId);
    }
  }

  clear(projectId: string, environmentId: string): void {
    this.setWorking(projectId, environmentId, false);
  }

  statusOf(projectId: string): AgentStatus {
    return (this.workingByProject.get(projectId)?.size ?? 0) > 0 ? AgentStatus.Working : AgentStatus.Idle;
  }
}

import { Injectable } from '@nestjs/common';
import * as k8s from '@kubernetes/client-node';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { environments, projectEnvironments, projectPodSettings, projectSettings, projects } from '../../db/schema';
import { PodService } from '../pod/pod.service';
import { TimeoutService, type EnvironmentKeepAlive } from '../timeout/timeout.service';
import type { PodClass } from '../pod/pod-classes';
import type { ProjectStatus } from '../project/project.types';
import type { PodPhase, PodRowView, PodStatusView, PodsView, PodProjectGroupView } from './pods-overview.types';

const AGENT_POD_SELECTOR = 'app=opsiforce-agent';
const ENVIRONMENT_ID_LABEL = 'opsiforce.io/environment-id';

const POOL_STATUSES = new Set<ProjectStatus>(['pending', 'claiming']);
const DRIFT_STATUSES = new Set<ProjectStatus>(['suspended', 'disabled', 'failed']);

const EMPTY_KEEP_ALIVE: EnvironmentKeepAlive = {
  agent: { lastTouchMs: null, remainingMs: null },
  app: { lastTouchMs: null, remainingMs: null },
};

interface TenantEnvRow {
  id: string;
  projectId: string;
  environmentId: string | null;
  isDefault: boolean;
  status: ProjectStatus;
  environmentName: string | null;
  environmentSlug: string | null;
  projectTitle: string | null;
  timeoutIdle: number;
  appTimeoutIdle: number;
  podClass: PodClass;
  cpuMillicores: number;
  memoryRequestMib: number;
  memoryLimitMib: number;
}

@Injectable()
export class PodsOverviewService {
  constructor(
    private readonly podService: PodService,
    private readonly timeoutService: TimeoutService
  ) {}

  async listForTenant(tenantId: string): Promise<PodsView> {
    const [pods, envRows] = await Promise.all([
      this.podService.listPods(AGENT_POD_SELECTOR),
      this.loadTenantEnvironments(tenantId),
    ]);
    const podByEnvId = this.indexPodsByEnvironment(pods);
    const now = Date.now();

    const rowEnvs = envRows.filter((pe) => !POOL_STATUSES.has(pe.status) && podByEnvId.has(pe.id));
    const keepAliveByEnvId = await this.timeoutService
      .getKeepAliveBatch(rowEnvs.map((pe) => pe.id))
      .catch(() => new Map<string, EnvironmentKeepAlive>());

    const built = rowEnvs
      .map((pe) => {
        const pod = podByEnvId.get(pe.id);
        if (!pod) return null;
        const keepAlive = keepAliveByEnvId.get(pe.id) ?? EMPTY_KEEP_ALIVE;
        return { projectId: pe.projectId, projectTitle: pe.projectTitle, row: this.buildRow(pe, pod, keepAlive, now) };
      })
      .filter((entry): entry is { projectId: string; projectTitle: string | null; row: PodRowView } => entry !== null);

    const groups = new Map<string, PodProjectGroupView>();
    const ensureGroup = (projectId: string, projectTitle: string | null): PodProjectGroupView => {
      const existing = groups.get(projectId);
      if (existing) return existing;
      const created: PodProjectGroupView = { projectId, projectTitle, environments: [], ghostCount: 0 };
      groups.set(projectId, created);
      return created;
    };

    built.forEach((entry) => ensureGroup(entry.projectId, entry.projectTitle).environments.push(entry.row));

    envRows.forEach((pe) => {
      if (POOL_STATUSES.has(pe.status)) return;
      if (pe.status === 'active' && !podByEnvId.has(pe.id)) {
        ensureGroup(pe.projectId, pe.projectTitle).ghostCount += 1;
      }
    });

    const projectGroups = [...groups.values()].toSorted(compareGroups).map((group) => ({
      projectId: group.projectId,
      projectTitle: group.projectTitle,
      environments: [...group.environments].toSorted(compareRows),
      ghostCount: group.ghostCount,
    }));

    return { projects: projectGroups };
  }

  private indexPodsByEnvironment(pods: k8s.V1Pod[]): Map<string, k8s.V1Pod> {
    const byEnvId = new Map<string, k8s.V1Pod>();
    pods.forEach((pod) => {
      const envId = pod.metadata?.labels?.[ENVIRONMENT_ID_LABEL];
      if (envId) byEnvId.set(envId, pod);
    });
    return byEnvId;
  }

  private buildRow(pe: TenantEnvRow, pod: k8s.V1Pod, keepAlive: EnvironmentKeepAlive, now: number): PodRowView {
    const creationTimestamp = pod.metadata?.creationTimestamp;

    return {
      projectEnvironmentId: pe.id,
      environmentId: pe.environmentId,
      environmentName: pe.environmentName ?? (pe.isDefault ? 'Development' : 'Environment'),
      environmentSlug: pe.environmentSlug,
      isDefault: pe.isDefault,
      podName: pod.metadata?.name ?? this.podService.assignedPodName(pe.id),
      status: this.deriveStatus(pod),
      ageMs: this.podService.podAgeMs(pod, now),
      resources: {
        podClass: pe.podClass,
        cpuMillicores: pe.cpuMillicores,
        memoryRequestMib: pe.memoryRequestMib,
        memoryLimitMib: pe.memoryLimitMib,
      },
      timeout: { agentIdleMs: pe.timeoutIdle, appIdleMs: pe.appTimeoutIdle },
      keepAlive: {
        agent: keepAlive.agent,
        app: keepAlive.app,
      },
      drift: DRIFT_STATUSES.has(pe.status),
      dbStatus: pe.status,
      detail: {
        podIp: pod.status?.podIP ?? null,
        startedAtMs: creationTimestamp ? new Date(creationTimestamp).getTime() : null,
      },
    };
  }

  private deriveStatus(pod: k8s.V1Pod): PodStatusView {
    const terminating = !!pod.metadata?.deletionTimestamp;
    const restartCount = (pod.status?.containerStatuses ?? []).reduce(
      (sum, status) => sum + (status.restartCount ?? 0),
      0
    );
    const failure = this.podService.inspectFailureReason(pod);
    return {
      phase: terminating ? 'terminating' : mapPhase(pod.status?.phase),
      ready: this.podService.isPodReady(pod),
      restartCount,
      reason: terminating ? 'Terminating' : failure,
    };
  }

  private loadTenantEnvironments(tenantId: string): Promise<TenantEnvRow[]> {
    return db
      .select({
        id: projectEnvironments.id,
        projectId: projectEnvironments.projectId,
        environmentId: projectEnvironments.environmentId,
        isDefault: projectEnvironments.isDefault,
        status: projectEnvironments.status,
        environmentName: environments.name,
        environmentSlug: environments.slug,
        projectTitle: projects.title,
        timeoutIdle: projectSettings.timeoutIdle,
        appTimeoutIdle: projectSettings.appTimeoutIdle,
        podClass: projectPodSettings.podClass,
        cpuMillicores: projectPodSettings.cpuMillicores,
        memoryRequestMib: projectPodSettings.memoryRequestMib,
        memoryLimitMib: projectPodSettings.memoryLimitMib,
      })
      .from(projectEnvironments)
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .innerJoin(projectSettings, eq(projectSettings.projectId, projectEnvironments.projectId))
      .innerJoin(projectPodSettings, eq(projectPodSettings.projectId, projectEnvironments.projectId))
      .leftJoin(environments, eq(environments.id, projectEnvironments.environmentId))
      .where(eq(projects.tenantId, tenantId)) as Promise<TenantEnvRow[]>;
  }
}

function mapPhase(phase: string | undefined): PodPhase {
  switch (phase) {
    case 'Running':
      return 'running';
    case 'Pending':
      return 'pending';
    case 'Succeeded':
      return 'succeeded';
    case 'Failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

function compareGroups(a: PodProjectGroupView, b: PodProjectGroupView): number {
  const titleA = a.projectTitle?.trim();
  const titleB = b.projectTitle?.trim();
  if (titleA && titleB) return titleA.localeCompare(titleB);
  if (titleA) return -1;
  if (titleB) return 1;
  return a.projectId.localeCompare(b.projectId);
}

function compareRows(a: PodRowView, b: PodRowView): number {
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return a.environmentName.localeCompare(b.environmentName);
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { eq, and, desc, asc, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { Queue } from 'bullmq';
import crypto from 'crypto';
import path from 'path';
import { db } from '../../db';
import {
  projectSettings,
  projectPodSettings,
  projects,
  projectApps,
  projectEnvironments,
  projectPublishJobs,
  projectSchedules,
  workspaceMembers,
  workspaces,
  tenants,
  tenantSettings,
  projectDuplicateJobs,
} from '../../db/schema';
import { PodService, PodStartupFailedError } from '../pod/pod.service';
import { ProxyService } from '../proxy/proxy.service';
import { ProjectPoolService } from '../pool/project-pool.service';
import { TimeoutService } from '../timeout/timeout.service';
import { BifrostService } from '../bifrost/bifrost.service';
import { assertPositiveMs } from '../common/validation';
import { restoreEnvJsonBackup } from '../common/env-file';
import { writeJsonAtomic } from '../common/fs';
import { lockProjectGit, type DbExecutor } from '../common/locks';
import { DefaultsService } from '../defaults/defaults.service';
import { GatewayKeyService } from '../gateway/gateway-key.service';
import { ScheduleService } from '../schedule/schedule.service';
import { AgentService } from '../agent/agent.service';
import { readAgentConfig } from '../agent/agent-config';
import { EnvironmentService } from '../environment/environment.service';
import { GitService } from '../git/git.service';
import { ProjectEnvironmentService } from '../project-environment/project-environment.service';
import type { ProjectEnvironmentContext } from '../project-environment/project-environment.types';
import {
  CreateProjectDto,
  UpdateProjectDto,
  DuplicateProjectDto,
  ProjectResponse,
  ProjectEnvironmentSummary,
  ProjectStatus,
  ProjectState,
  ProjectAuthResponse,
  UpdateProjectAuthDto,
  ProjectDuplicateOperation,
  UpdateAppDto,
  UpdateProjectPodClassDto,
  UpdateProjectLoggingDto,
  ProjectLoggingResponse,
  RequestLogMode,
  REQUEST_LOG_BODY_LIMIT_MAX,
} from './project.types';
import {
  buildPodClassCatalog,
  clampCustom,
  isPreset,
  resolvePreset,
  toK8sResources,
  type K8sResourceRequirements,
  type PodClassCatalog,
  type PodResources,
} from '../pod/pod-classes';

const APP_NAME_MIN_LENGTH = 1;
const APP_NAME_MAX_LENGTH = 80;
const APP_DESCRIPTION_MAX_LENGTH = 500;
const CRASH_LOOP_RECREATE_AGE_MS = 60 * 1000;
const UNSCHEDULABLE_STARTUP_GRACE_MS = 180 * 1000;
const STARTUP_RETRY_BASE_MS = 5 * 1000;
const STARTUP_RETRY_MAX_MS = 5 * 60 * 1000;
const DUPLICATE_APP_READY_TIMEOUT_MS = 5 * 60 * 1000;

interface AppMetaPatch {
  name?: string;
  description?: string | null;
}

function validateUpdateAppDto(body: UpdateAppDto): AppMetaPatch {
  const patch: AppMetaPatch = {};

  if ('name' in body) patch.name = validateAppName(body.name);
  if ('description' in body) patch.description = validateAppDescription(body.description);

  if (!('name' in patch) && !('description' in patch)) {
    throw new BadRequestException("At least one of 'name' or 'description' must be provided");
  }

  return patch;
}

function validateAppName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException("'name' must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length < APP_NAME_MIN_LENGTH || trimmed.length > APP_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `'name' must be ${APP_NAME_MIN_LENGTH}-${APP_NAME_MAX_LENGTH} characters after trimming`
    );
  }
  return trimmed;
}

function validateAppDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException("'description' must be a string or null");
  }
  const trimmed = value.trim();
  if (trimmed.length > APP_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestException(
      `'description' must be at most ${APP_DESCRIPTION_MAX_LENGTH} characters after trimming`
    );
  }
  return trimmed.length === 0 ? null : trimmed;
}
import { ProjectAuthService } from './project-auth.service';
import { ProjectEventsService } from './project-events.service';
import { AppService } from './app.service';
import { AppReadinessService } from './app-readiness.service';
import {
  ACTIVE_DUPLICATE_STATUSES,
  PROJECT_DUPLICATE_QUEUE,
  ProjectDuplicateStatus,
  type ProjectDuplicateJobData,
} from './project-duplicate.types';
import { ACTIVE_PUBLISH_STATUSES } from '../publish/publish.types';

type ProjectActivityKind = 'agent' | 'app';

export interface EnsureEnvironmentResult {
  state: 'ready' | 'starting' | 'disabled' | 'failed';
  env: ProjectEnvironmentContext;
}

const projectOrderBy = () =>
  [
    asc(sql`CASE WHEN ${projects.disabled} THEN 1 ELSE 0 END`),
    desc(projectEnvironments.lastActiveAt),
    desc(projects.createdAt),
  ] as const;

const effectiveStatus = sql<ProjectStatus>`CASE WHEN ${projects.disabled} THEN 'disabled' ELSE ${projectEnvironments.status} END`;

const projectSelectFields = {
  id: projects.id,
  tenantId: projects.tenantId,
  workspaceId: projects.workspaceId,
  agentId: projects.agentId,
  title: projects.title,
  description: projects.description,
  disabled: projects.disabled,
  bifrostProjectId: projects.bifrostProjectId,
  directory: projectEnvironments.directory,
  status: effectiveStatus.as('status'),
  podIp: projectEnvironments.podIp,
  sessionId: projectEnvironments.sessionId,
  platformVersion: projectEnvironments.platformVersion,
  authMode: projectEnvironments.authMode,
  timeoutIdle: projectSettings.timeoutIdle,
  appTimeoutIdle: projectSettings.appTimeoutIdle,
  timezone: projectSettings.timezone,
  requestLogMode: projectSettings.requestLogMode,
  requestLogBodyLimit: projectSettings.requestLogBodyLimit,
  podClass: projectPodSettings.podClass,
  cpuMillicores: projectPodSettings.cpuMillicores,
  memoryRequestMib: projectPodSettings.memoryRequestMib,
  memoryLimitMib: projectPodSettings.memoryLimitMib,
  isPinned: sql<boolean>`coalesce(${projectApps.isPinned}, false)`.as('is_pinned'),
  pinnedAt: projectApps.pinnedAt,
  pinnedEnvironmentId: projectApps.pinnedEnvironmentId,
  hasApp: sql<boolean>`${projectApps.projectId} is not null`.as('has_app'),
  appName: projectApps.name,
  appDescription: projectApps.description,
  lastActiveAt: projectEnvironments.lastActiveAt,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

@Injectable()
export class ProjectService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectService.name);
  private readonly startupTasks = new Map<string, Promise<void>>();
  private readonly startupRetries = new Map<string, number>();
  private readonly recreateRequests = new Set<string>();
  private readonly agentModelByName: Map<string, string>;

  constructor(
    private readonly podService: PodService,
    private readonly projectPoolService: ProjectPoolService,
    private readonly timeoutService: TimeoutService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BifrostService))
    private readonly bifrostService: BifrostService,
    private readonly defaultsService: DefaultsService,
    private readonly gatewayKeyService: GatewayKeyService,
    @Inject(forwardRef(() => ScheduleService))
    private readonly scheduleService: ScheduleService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly projectEventsService: ProjectEventsService,
    private readonly appService: AppService,
    private readonly appReadiness: AppReadinessService,
    private readonly agentService: AgentService,
    private readonly environmentService: EnvironmentService,
    private readonly gitService: GitService,
    private readonly projectEnvironmentService: ProjectEnvironmentService,
    private readonly proxyService: ProxyService,
    @InjectQueue(PROJECT_DUPLICATE_QUEUE)
    private readonly duplicateQueue: Queue<ProjectDuplicateJobData>
  ) {
    this.agentModelByName = readAgentConfig().models;
  }

  async onApplicationBootstrap() {
    await this.cleanupOrphanedAssignedPods().catch((err) => {
      this.logger.warn(`Failed to clean up orphaned assigned pods: ${err.message}`);
    });
    await this.recoverDuplicateJobs().catch((err) => {
      this.logger.warn(`Failed to recover duplicate jobs on startup: ${err.message}`);
    });
    await this.resumeStartingEnvironments().catch((err) => {
      this.logger.warn(`Failed to resume starting environments: ${err.message}`);
    });
  }

  private async resumeStartingEnvironments(): Promise<void> {
    const stranded = (await this.projectEnvironmentService.listByStatus(ProjectStatus.Publishing)).filter(
      (env) => !env.disabled
    );
    for (const env of stranded) {
      const recoveredStatus = await this.rollBackStrandedPublish(env);
      await this.projectEnvironmentService
        .patch(env.id, { status: recoveredStatus, podIp: null }, ProjectStatus.Publishing)
        .catch((err) => {
          this.logger.warn(`Failed to recover publishing environment ${env.id}: ${(err as Error).message}`);
        });
    }
    if (stranded.length > 0) {
      this.logger.warn(
        `Recovered ${stranded.length} environment(s) stranded mid-publish after restart; their publish jobs were marked failed, deployed environments were rolled back to their last deployed commit, never-deployed ones were marked failed`
      );
    }

    const rows = await this.projectEnvironmentService.listByStatus(ProjectStatus.Starting);
    const active = rows.filter((env) => !env.disabled);

    for (const env of active) {
      this.spawnStartupWorker(env.id);
    }

    if (active.length > 0) {
      this.logger.log(`Resumed startup workers for ${active.length} environment(s) in 'starting' state`);
    }
  }

  private async rollBackStrandedPublish(env: ProjectEnvironmentContext): Promise<ProjectStatus> {
    if (env.deployedCommitSha === null) return ProjectStatus.Failed;
    const storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
    try {
      await this.gitService.resetHard(path.join(storageMountPath, env.directory), env.deployedCommitSha);
      await restoreEnvJsonBackup(storageMountPath, env.directory);
      return ProjectStatus.Starting;
    } catch (err) {
      this.logger.warn(
        `Failed to roll back stranded environment ${env.id} to deployed commit ${env.deployedCommitSha}: ${(err as Error).message}`
      );
      return ProjectStatus.Failed;
    }
  }

  private async cleanupOrphanedAssignedPods(): Promise<void> {
    const agentPods = await this.podService.listPods('app=opsiforce-agent');
    const podRefs = agentPods
      .map((pod) => ({
        name: pod.metadata?.name ?? null,
        envId:
          pod.metadata?.labels?.['opsiforce.io/environment-id'] ??
          pod.metadata?.labels?.['opsiforce.io/project-id'] ??
          null,
      }))
      .filter((pod): pod is { name: string; envId: string } => !!pod.name && !!pod.envId);

    if (podRefs.length === 0) return;

    const envIds = Array.from(new Set(podRefs.map((pod) => pod.envId)));
    const existingRows = await db
      .select({ id: projectEnvironments.id, status: projectEnvironments.status, disabled: projects.disabled })
      .from(projectEnvironments)
      .innerJoin(projects, eq(projects.id, projectEnvironments.projectId))
      .where(inArray(projectEnvironments.id, envIds));
    const envsExpectingPod = new Set(
      existingRows
        .filter(
          (row) =>
            !row.disabled &&
            (row.status === ProjectStatus.Starting ||
              row.status === ProjectStatus.Active ||
              row.status === ProjectStatus.Pending ||
              row.status === ProjectStatus.Claiming)
        )
        .map((row) => row.id)
    );
    const orphanedPods = podRefs.filter((pod) => !envsExpectingPod.has(pod.envId));

    await Promise.allSettled(
      orphanedPods.map((pod) => {
        this.logger.warn(`Deleting orphaned assigned pod ${pod.name} for missing environment ${pod.envId}`);
        return this.safeDeletePod(pod.name, `orphaned environment ${pod.envId}`);
      })
    );
  }

  async create(
    dto: CreateProjectDto | undefined,
    tenantId: string,
    workspaceId: string | null = null
  ): Promise<ProjectResponse> {
    const agentId = dto?.agentId ?? (await this.agentService.getDefaultAgentId());
    const timeouts = await this.defaultsService.getTenantTimeouts(tenantId);

    const claimedId = await this.projectPoolService
      .claimPending(agentId, {
        tenantId,
        workspaceId,
        title: dto?.title ?? null,
        description: dto?.description ?? null,
        timeoutIdle: timeouts.defaultTimeoutIdle,
        appTimeoutIdle: timeouts.defaultAppTimeoutIdle,
        timezone: dto?.timezone || 'UTC',
      })
      .catch((err) => {
        this.logger.warn(`Pool claim failed; falling back to slow path: ${(err as Error).message}`);
        return null;
      });

    if (claimedId) {
      const project = await this.findOne(claimedId, tenantId);
      await Promise.allSettled([this.timeoutService.touch(project.id), this.projectEventsService.publish(project.id)]);
      return project;
    }

    return this.createDirect(dto, tenantId, workspaceId, agentId, timeouts);
  }

  private async createDirect(
    dto: CreateProjectDto | undefined,
    tenantId: string,
    workspaceId: string | null,
    agentId: string,
    timeouts: { defaultTimeoutIdle: number; defaultAppTimeoutIdle: number }
  ): Promise<ProjectResponse> {
    const id = crypto.randomUUID();
    const directory = `projects/${id}`;
    const platformVersion = this.configService.get<string>('platformVersion', '0.1.0');
    const defaultEnvironment = await this.environmentService.ensureDefaultForTenant(tenantId);

    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id,
        tenantId,
        workspaceId,
        agentId,
        title: dto?.title ?? null,
        description: dto?.description ?? null,
      });

      await tx.insert(projectSettings).values({
        projectId: id,
        timeoutIdle: timeouts.defaultTimeoutIdle,
        appTimeoutIdle: timeouts.defaultAppTimeoutIdle,
        timezone: dto?.timezone || 'UTC',
      });

      await tx.insert(projectPodSettings).values({
        projectId: id,
        podClass: 'small',
        ...resolvePreset('small', this.podClassSmallOverride()),
      });

      await tx.insert(projectEnvironments).values({
        id,
        projectId: id,
        environmentId: defaultEnvironment.id,
        isDefault: true,
        directory,
        platformVersion,
        status: ProjectStatus.Starting,
      });
    });

    await this.createBifrostResources(id, tenantId);
    await this.createGatewayKey(id, id, tenantId);
    this.spawnStartupWorker(id);

    return this.findOne(id, tenantId);
  }

  async duplicate(sourceId: string, tenantId: string, dto?: DuplicateProjectDto): Promise<ProjectResponse> {
    const source = await this.findOne(sourceId, tenantId);
    await this.assertNoActiveGitOperation(source.id);

    const id = crypto.randomUUID();
    const duplicateJobId = crypto.randomUUID();
    const directory = `projects/${id}`;
    const platformVersion = this.configService.get<string>('platformVersion', '0.1.0');
    const title = dto?.title ?? (source.title ? `${source.title} (copy)` : null);
    const defaultEnvironment = await this.environmentService.ensureDefaultForTenant(tenantId);
    const [sourceApp] = await db.select().from(projectApps).where(eq(projectApps.projectId, source.id));
    const sourceSchedules = await db
      .select()
      .from(projectSchedules)
      .where(eq(projectSchedules.projectEnvironmentId, source.id));

    await db.transaction(async (tx) => {
      await lockProjectGit(tx, source.id);
      await this.assertNoActiveGitOperation(source.id, tx);

      await tx.insert(projects).values({
        id,
        tenantId,
        workspaceId: source.workspaceId,
        agentId: source.agentId,
        title,
        description: source.description,
      });

      await tx.insert(projectSettings).values({
        projectId: id,
        timeoutIdle: source.timeoutIdle,
        appTimeoutIdle: source.appTimeoutIdle,
        timezone: source.timezone,
        requestLogMode: source.requestLogMode,
        requestLogBodyLimit: source.requestLogBodyLimit,
      });

      await tx.insert(projectPodSettings).values({
        projectId: id,
        podClass: source.podClass,
        cpuMillicores: source.cpuMillicores,
        memoryRequestMib: source.memoryRequestMib,
        memoryLimitMib: source.memoryLimitMib,
      });

      await tx.insert(projectEnvironments).values({
        id,
        projectId: id,
        environmentId: defaultEnvironment.id,
        isDefault: true,
        directory,
        platformVersion,
        status: ProjectStatus.Starting,
        authMode: source.authMode,
      });

      if (sourceApp) {
        await tx.insert(projectApps).values({
          projectId: id,
          name: sourceApp.name,
          description: sourceApp.description,
          iconUrl: sourceApp.iconUrl,
        });
      }

      if (sourceSchedules.length > 0) {
        await tx.insert(projectSchedules).values(
          sourceSchedules.map((schedule) => ({
            id: crypto.randomUUID(),
            projectId: id,
            projectEnvironmentId: id,
            tenantId,
            name: schedule.name,
            cronPattern: schedule.cronPattern,
            timeZone: schedule.timeZone,
            targetPath: schedule.targetPath,
            method: schedule.method,
            body: schedule.body,
            headers: schedule.headers,
            isActive: false,
          }))
        );
      }

      await tx.insert(projectDuplicateJobs).values({
        id: duplicateJobId,
        sourceProjectId: source.id,
        targetProjectId: id,
        tenantId,
        status: ProjectDuplicateStatus.Queued,
      });
    });

    await this.createBifrostResources(id, tenantId);
    await this.createGatewayKey(id, id, tenantId);
    await this.enqueueDuplicateJob({
      duplicateJobId,
      sourceProjectId: source.id,
      targetProjectId: id,
    });
    await this.projectEventsService.publish(id);

    return this.findOne(id, tenantId);
  }

  async ensureEnvironmentById(envId: string, activity: ProjectActivityKind): Promise<EnsureEnvironmentResult> {
    const env = await this.projectEnvironmentService.findByIdOrNull(envId);
    if (!env) throw new NotFoundException(`Project environment ${envId} not found`);
    return this.ensureEnvironment(env, activity);
  }

  async findAll(tenantId: string): Promise<ProjectResponse[]> {
    return this.selectProjects(eq(projects.tenantId, tenantId));
  }

  async findAllForUser(params: { tenantId: string; userId: string }): Promise<ProjectResponse[]> {
    const { tenantId, userId } = params;

    return db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectEnvironments, eq(projectEnvironments.id, projects.id))
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .innerJoin(projectPodSettings, eq(projectPodSettings.projectId, projects.id))
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, projects.workspaceId), eq(workspaceMembers.userId, userId))
      )
      .where(
        and(
          eq(projects.tenantId, tenantId),
          or(isNull(projects.workspaceId), sql`${workspaceMembers.workspaceId} is not null`)
        )
      )
      .orderBy(...projectOrderBy()) as Promise<ProjectResponse[]>;
  }

  async findAllInWorkspace(tenantId: string, workspaceId: string): Promise<ProjectResponse[]> {
    return this.selectProjects(and(eq(projects.tenantId, tenantId), eq(projects.workspaceId, workspaceId))!);
  }

  private selectProjects(where: SQL): Promise<ProjectResponse[]> {
    return db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectEnvironments, eq(projectEnvironments.id, projects.id))
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .innerJoin(projectPodSettings, eq(projectPodSettings.projectId, projects.id))
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
      .where(where)
      .orderBy(...projectOrderBy()) as Promise<ProjectResponse[]>;
  }

  async findOne(id: string, tenantId: string): Promise<ProjectResponse> {
    const [project] = (await db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectEnvironments, eq(projectEnvironments.id, projects.id))
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .innerJoin(projectPodSettings, eq(projectPodSettings.projectId, projects.id))
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))) as ProjectResponse[];
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async findOneForUser(params: { projectId: string; tenantId: string; userId: string }): Promise<ProjectResponse> {
    const { projectId, tenantId, userId } = params;
    const project = await this.findOne(projectId, tenantId);
    await this.assertProjectVisibleToUser(project.id, project.workspaceId, userId);
    return project;
  }

  private async assertProjectVisibleToUser(
    projectId: string,
    workspaceId: string | null,
    userId: string
  ): Promise<void> {
    if (!workspaceId) return;

    const [ws] = await db
      .select({ type: workspaces.type, ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!ws) return;

    if (ws.type === 'private') {
      if (ws.ownerId !== userId) {
        throw new NotFoundException(`Project ${projectId} not found`);
      }
      return;
    }

    const [member] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
    if (!member) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }

  async getState(params: { projectId: string; tenantId: string; userId: string }): Promise<ProjectState> {
    const { projectId, tenantId, userId } = params;

    const [row] = await db
      .select({
        id: projects.id,
        status: projectEnvironments.status,
        disabled: projects.disabled,
        workspaceId: projects.workspaceId,
        title: projects.title,
      })
      .from(projects)
      .innerJoin(projectEnvironments, eq(projectEnvironments.id, projects.id))
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));

    if (!row) throw new NotFoundException(`Project ${projectId} not found`);

    await this.assertProjectVisibleToUser(row.id, row.workspaceId, userId);

    const status = row.disabled ? ProjectStatus.Disabled : (row.status as ProjectStatus);
    const operation = await this.findDuplicateOperation(row.id);
    const app = status === ProjectStatus.Active ? await this.appService.get(row.id) : null;
    return {
      id: row.id,
      status,
      workspaceId: row.workspaceId,
      title: row.title,
      operation: operation ?? null,
      app,
    };
  }

  async findOneById(id: string): Promise<ProjectResponse> {
    const [project] = (await db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectEnvironments, eq(projectEnvironments.id, projects.id))
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .innerJoin(projectPodSettings, eq(projectPodSettings.projectId, projects.id))
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
      .where(eq(projects.id, id))) as ProjectResponse[];

    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  async listEnvironments(projectId: string, tenantId: string): Promise<ProjectEnvironmentSummary[]> {
    await this.findOne(projectId, tenantId);
    const envs = await this.projectEnvironmentService.listByProjectId(projectId);
    const pinned = await db
      .select({ isPinned: projectApps.isPinned, pinnedEnvironmentId: projectApps.pinnedEnvironmentId })
      .from(projectApps)
      .where(eq(projectApps.projectId, projectId));
    const pinnedRow = pinned[0];
    const pinnedEnvironmentId = pinnedRow?.isPinned ? (pinnedRow.pinnedEnvironmentId ?? projectId) : null;

    return envs
      .toSorted((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.getTime() - b.createdAt.getTime())
      .map((env) => ({
        id: env.id,
        projectId: env.projectId,
        environmentId: env.environmentId,
        name: env.isDefault ? 'Development' : (env.environmentName ?? 'Environment'),
        slug: env.environmentSlug,
        isDefault: env.isDefault,
        status: env.disabled ? ProjectStatus.Disabled : env.status,
        authMode: env.authMode,
        deployedCommitSha: env.deployedCommitSha,
        lastActiveAt: env.lastActiveAt,
        isPinned: pinnedEnvironmentId === env.id,
        sessionId: env.sessionId,
      }));
  }

  async setEnvironmentSession(
    projectId: string,
    environmentId: string,
    tenantId: string,
    sessionId: string | null
  ): Promise<void> {
    await this.findOne(projectId, tenantId);
    const env = await this.projectEnvironmentService.findById(environmentId);
    if (env.projectId !== projectId) {
      throw new NotFoundException(`Environment ${environmentId} does not belong to project ${projectId}`);
    }
    await this.projectEnvironmentService.patch(environmentId, { sessionId });
  }

  async update(id: string, dto: UpdateProjectDto, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);
    const now = new Date();
    const projectUpdates: Partial<typeof projects.$inferInsert> = {};
    const settingsUpdates: Partial<typeof projectSettings.$inferInsert> = {};

    if (dto.title !== undefined) projectUpdates.title = dto.title;
    if (dto.description !== undefined) projectUpdates.description = dto.description;
    if (dto.timeoutIdle !== undefined) settingsUpdates.timeoutIdle = assertPositiveMs(dto.timeoutIdle, 'timeoutIdle');
    if (dto.appTimeoutIdle !== undefined)
      settingsUpdates.appTimeoutIdle = assertPositiveMs(dto.appTimeoutIdle, 'appTimeoutIdle');
    if (dto.timezone !== undefined) settingsUpdates.timezone = dto.timezone;

    await db.transaction(async (tx) => {
      if (Object.keys(projectUpdates).length > 0) {
        await tx
          .update(projects)
          .set({ ...projectUpdates, updatedAt: now })
          .where(eq(projects.id, project.id));
      }

      if (Object.keys(settingsUpdates).length > 0) {
        await tx.update(projectSettings).set(settingsUpdates).where(eq(projectSettings.projectId, project.id));
      }
    });

    if (dto.timeoutIdle !== undefined) {
      await this.timeoutService.touch(id).catch((err) => {
        this.logger.warn(`Failed to refresh agent timeout for project ${id}: ${(err as Error).message}`);
      });
    }
    if (dto.appTimeoutIdle !== undefined) {
      await this.timeoutService.touchApp(id).catch((err) => {
        this.logger.warn(`Failed to refresh app timeout for project ${id}: ${(err as Error).message}`);
      });
    }

    return this.findOne(id, tenantId);
  }

  getPodClassCatalog(): PodClassCatalog {
    return buildPodClassCatalog(this.podClassSmallOverride());
  }

  async updatePodClass(id: string, dto: UpdateProjectPodClassDto, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);
    const resources = this.resolvePodClassResources(dto);

    await db
      .update(projectPodSettings)
      .set({ podClass: dto.podClass, ...resources })
      .where(eq(projectPodSettings.projectId, project.id));

    return this.findOne(id, tenantId);
  }

  private resolvePodClassResources(dto: UpdateProjectPodClassDto): PodResources {
    if (dto.podClass === 'custom') {
      if (
        typeof dto.cpuMillicores !== 'number' ||
        typeof dto.memoryRequestMib !== 'number' ||
        typeof dto.memoryLimitMib !== 'number'
      ) {
        throw new BadRequestException(
          'Custom pod class requires numeric cpuMillicores, memoryRequestMib, and memoryLimitMib'
        );
      }
      return clampCustom({
        cpuMillicores: dto.cpuMillicores,
        memoryRequestMib: dto.memoryRequestMib,
        memoryLimitMib: dto.memoryLimitMib,
      });
    }
    if (!isPreset(dto.podClass)) {
      throw new BadRequestException(`Unknown pod class: ${String(dto.podClass)}`);
    }
    return resolvePreset(dto.podClass, this.podClassSmallOverride());
  }

  private podClassSmallOverride(): PodResources | null {
    return this.configService.get<PodResources | null>('podClassSmall', null);
  }

  private async podResourcesForProject(projectId: string): Promise<K8sResourceRequirements> {
    const [row] = await db
      .select({
        cpuMillicores: projectPodSettings.cpuMillicores,
        memoryRequestMib: projectPodSettings.memoryRequestMib,
        memoryLimitMib: projectPodSettings.memoryLimitMib,
      })
      .from(projectPodSettings)
      .where(eq(projectPodSettings.projectId, projectId));
    return toK8sResources(row ?? resolvePreset('small', this.podClassSmallOverride()));
  }

  async getLogging(id: string, tenantId: string): Promise<ProjectLoggingResponse> {
    const project = await this.findOne(id, tenantId);
    return { mode: project.requestLogMode, bodyLimit: project.requestLogBodyLimit };
  }

  async updateLogging(id: string, dto: UpdateProjectLoggingDto, tenantId: string): Promise<ProjectLoggingResponse> {
    const project = await this.findOne(id, tenantId);

    if (!Object.values(RequestLogMode).includes(dto.mode)) {
      throw new BadRequestException(`Unknown request log mode: ${dto.mode}`);
    }

    const settingsUpdates: Partial<typeof projectSettings.$inferInsert> = {
      requestLogMode: dto.mode,
    };

    if (dto.bodyLimit !== undefined) {
      if (!Number.isFinite(dto.bodyLimit) || dto.bodyLimit < 0) {
        throw new BadRequestException('bodyLimit must be a non-negative byte value');
      }
      settingsUpdates.requestLogBodyLimit = Math.min(Math.round(dto.bodyLimit), REQUEST_LOG_BODY_LIMIT_MAX);
    }

    await db.update(projectSettings).set(settingsUpdates).where(eq(projectSettings.projectId, project.id));

    return this.getLogging(id, tenantId);
  }

  private async resolveProjectEnvironment(
    projectId: string,
    environmentId: string,
    tenantId: string
  ): Promise<ProjectEnvironmentContext> {
    await this.findOne(projectId, tenantId);
    const env = await this.projectEnvironmentService.findById(environmentId);
    if (env.projectId !== projectId) {
      throw new NotFoundException(`Environment ${environmentId} not found`);
    }
    return env;
  }

  async getAuth(projectId: string, environmentId: string, tenantId: string): Promise<ProjectAuthResponse> {
    const env = await this.resolveProjectEnvironment(projectId, environmentId, tenantId);
    const callbackUrls = this.projectAuthService.callbackUrls(env.id, env.environmentSlug);
    if (env.authMode === 'public') return { mode: 'public', callbackUrls };
    const { config, bypassAuthPaths } = await this.projectAuthService.getConfig(env.id);
    if (env.authMode === 'makara') return { mode: 'makara', bypassAuthPaths, callbackUrls };
    return { mode: 'manual', config, bypassAuthPaths, callbackUrls };
  }

  async updateAuth(
    projectId: string,
    environmentId: string,
    dto: UpdateProjectAuthDto,
    tenantId: string
  ): Promise<ProjectAuthResponse> {
    const env = await this.resolveProjectEnvironment(projectId, environmentId, tenantId);
    if (dto.mode !== 'public' && dto.mode !== 'manual' && dto.mode !== 'makara') {
      throw new BadRequestException(`Unknown auth mode: ${String(dto.mode)}`);
    }

    if (dto.mode === 'manual') {
      await this.projectAuthService.apply(env.id, env.environmentSlug, dto.config ?? {}, dto.bypassAuthPaths);
    } else if (dto.mode === 'makara') {
      const makaraTenantName = await this.findMakaraTenantName(tenantId);
      await this.projectAuthService.applyMakara(env.id, env.environmentSlug, makaraTenantName, dto.bypassAuthPaths);
    } else {
      await this.projectAuthService.remove(env.id);
    }

    await db
      .update(projectEnvironments)
      .set({ authMode: dto.mode, updatedAt: new Date() })
      .where(eq(projectEnvironments.id, env.id));

    return this.getAuth(projectId, env.id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId);
    const envs = await this.projectEnvironmentService.listByProjectId(id);

    await Promise.allSettled([
      ...envs.map((env) => this.safeDeletePod(this.podService.assignedPodName(env.id), `removing project ${id}`)),
      this.bifrostService.isEnabled()
        ? this.bifrostService.revokeProjectKeys(id).catch((err) => {
            this.logger.warn(`Failed to revoke Bifrost keys for project ${id}: ${(err as Error).message}`);
          })
        : Promise.resolve(),
      this.gatewayKeyService.revokeKeys(id).catch((err) => {
        this.logger.warn(`Failed to revoke gateway keys for project ${id}: ${(err as Error).message}`);
      }),
      this.scheduleService.removeAllForProject(id).catch((err) => {
        this.logger.warn(`Failed to remove schedules for project ${id}: ${(err as Error).message}`);
      }),
      ...envs.map((env) => this.timeoutService.clear(env.id)),
    ]);

    await db.delete(projects).where(eq(projects.id, id));

    if (project.tenantId) {
      await Promise.allSettled(
        envs.map((env) =>
          this.projectEnvironmentService.delete({
            id: env.id,
            projectId: env.projectId,
            tenantId: env.tenantId,
            directory: env.directory,
          })
        )
      );
    }
  }

  async disable(id: string, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);
    if (project.disabled) {
      throw new BadRequestException('Project is already disabled');
    }

    const envs = await this.projectEnvironmentService.listByProjectId(id);

    await Promise.allSettled([
      ...envs.map((env) => this.safeDeletePod(this.podService.assignedPodName(env.id), `disabling project ${id}`)),
      ...envs.map((env) => this.timeoutService.clear(env.id)),
    ]);

    await db.transaction(async (tx) => {
      await tx.update(projects).set({ disabled: true, updatedAt: new Date() }).where(eq(projects.id, id));
      await tx
        .update(projectEnvironments)
        .set({ podIp: null, updatedAt: new Date() })
        .where(eq(projectEnvironments.projectId, id));
    });

    await this.projectEventsService.publish(id);

    return this.findOne(id, tenantId);
  }

  async enable(id: string, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);
    if (!project.disabled) {
      throw new BadRequestException('Project is not disabled');
    }

    const envs = await this.projectEnvironmentService.listByProjectId(id);

    await db.update(projects).set({ disabled: false, updatedAt: new Date() }).where(eq(projects.id, id));
    await Promise.all(
      envs.map((env) => this.projectEnvironmentService.patch(env.id, { status: ProjectStatus.Starting, podIp: null }))
    );

    envs.forEach((env) => this.spawnStartupWorker(env.id));
    await this.projectEventsService.publish(id);
    return this.findOne(id, tenantId);
  }

  async restart(id: string, tenantId: string, environmentId?: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);
    if (project.disabled) {
      throw new BadRequestException('Disabled project cannot be restarted');
    }

    const env = await this.projectEnvironmentService.findById(environmentId ?? id);
    if (env.projectId !== id) {
      throw new NotFoundException(`Environment ${environmentId ?? id} not found`);
    }

    await this.requestEnvironmentStartup(env, { deleteExistingPod: true });
    return this.findOne(id, tenantId);
  }

  async removeEnvironment(projectId: string, environmentId: string, tenantId: string): Promise<void> {
    await this.findOne(projectId, tenantId);
    const env = await this.projectEnvironmentService.findById(environmentId);
    if (env.projectId !== projectId) {
      throw new NotFoundException(`Environment ${environmentId} not found`);
    }
    if (env.isDefault) {
      throw new BadRequestException('The Development environment cannot be deleted');
    }

    await db
      .update(projectApps)
      .set({ isPinned: false, pinnedEnvironmentId: null, pinnedById: null, pinnedAt: null, updatedAt: new Date() })
      .where(and(eq(projectApps.projectId, projectId), eq(projectApps.pinnedEnvironmentId, env.id)));

    await Promise.allSettled([
      this.safeDeletePod(this.podService.assignedPodName(env.id), `deleting environment ${env.id}`),
      this.projectAuthService.remove(env.id).catch((err) => {
        this.logger.warn(`Failed to remove auth middleware for environment ${env.id}: ${(err as Error).message}`);
      }),
      this.bifrostService.isEnabled()
        ? this.bifrostService.revokeEnvironmentKeys(env.id).catch((err) => {
            this.logger.warn(`Failed to revoke Bifrost keys for environment ${env.id}: ${(err as Error).message}`);
          })
        : Promise.resolve(),
      this.gatewayKeyService.revokeEnvironmentKeys(env.id).catch((err) => {
        this.logger.warn(`Failed to revoke gateway keys for environment ${env.id}: ${(err as Error).message}`);
      }),
      this.scheduleService.removeAllForEnvironment(env.id).catch((err) => {
        this.logger.warn(`Failed to remove schedules for environment ${env.id}: ${(err as Error).message}`);
      }),
      this.timeoutService.clear(env.id),
    ]);

    await this.projectEnvironmentService.delete({
      id: env.id,
      projectId: env.projectId,
      tenantId: env.tenantId,
      directory: env.directory,
    });

    await this.projectEventsService.publish(projectId);
  }

  async updateApp(id: string, tenantId: string, body: UpdateAppDto): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);
    if (!project.hasApp) {
      throw new BadRequestException(
        "APP_NOT_DETECTED: this project has no detectable app yet. Make sure the project's web server is running and serves /api/app-meta before editing app details."
      );
    }

    const patch = validateUpdateAppDto(body);
    const current = (await this.appService.get(id)) ?? { name: null, description: null };
    const name = patch.name ?? current.name;
    const description = 'description' in patch ? (patch.description ?? null) : current.description;

    if (!name) {
      throw new BadRequestException("'name' is required and cannot be empty");
    }

    await this.writeAppMetaFile(project.directory, { name, description });
    await db.update(projectApps).set({ name, description, updatedAt: new Date() }).where(eq(projectApps.projectId, id));

    await this.projectEventsService.publish(id);

    return this.findOne(id, tenantId);
  }

  private async writeAppMetaFile(
    projectDirectory: string,
    meta: { name: string; description: string | null }
  ): Promise<void> {
    const storageMountPath = this.configService.getOrThrow<string>('storageMountPath');
    const target = path.join(storageMountPath, projectDirectory, 'app', 'app.meta.json');
    const content: { name: string; description?: string } = { name: meta.name };
    if (meta.description !== null) content.description = meta.description;
    await writeJsonAtomic(target, content);
  }

  async setAppPin(
    id: string,
    tenantId: string,
    userId: string,
    isPinned: boolean,
    environmentId?: string
  ): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId);

    if (isPinned) {
      const pinnedEnvironmentId = environmentId ?? project.pinnedEnvironmentId ?? id;
      const targetEnv = await this.projectEnvironmentService.findById(pinnedEnvironmentId);
      if (targetEnv.projectId !== id) {
        throw new BadRequestException('Pinned environment does not belong to this project');
      }
      if (targetEnv.authMode !== 'public') {
        throw new BadRequestException(
          "Only apps with public auth can be pinned to Makara. Change the environment's auth mode to public before pinning."
        );
      }
      if (!project.hasApp) {
        throw new BadRequestException(
          "This project has no detectable app yet. Make sure the project's web server is running before pinning."
        );
      }
      await db
        .update(projectApps)
        .set({
          isPinned: true,
          pinnedEnvironmentId,
          pinnedById: userId,
          pinnedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectApps.projectId, id));
    } else if (project.hasApp) {
      await db
        .update(projectApps)
        .set({
          isPinned: false,
          pinnedById: null,
          pinnedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(projectApps.projectId, id));
    }

    return this.findOne(id, tenantId);
  }

  async findMakaraTenantName(tenantId: string): Promise<string> {
    const [row] = await db
      .select({
        makaraTenantName: tenantSettings.makaraTenantName,
        tenantName: tenants.name,
      })
      .from(tenants)
      .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId));
    if (!row) throw new BadRequestException(`Tenant ${tenantId} not found`);
    return row.makaraTenantName ?? row.tenantName;
  }

  async reassignPodById(id: string): Promise<void> {
    const env = await this.projectEnvironmentService.findById(id);
    await this.requestEnvironmentStartup(env, { deleteExistingPod: true });
  }

  async requestStartupForId(id: string): Promise<void> {
    const env = await this.projectEnvironmentService.findById(id);
    await this.requestEnvironmentStartup(env, { deleteExistingPod: false });
  }

  async beginPublishDeploy(envId: string): Promise<void> {
    const updated = await this.projectEnvironmentService.patch(
      envId,
      { status: ProjectStatus.Publishing, podIp: null },
      [
        ProjectStatus.Active,
        ProjectStatus.Starting,
        ProjectStatus.Failed,
        ProjectStatus.Suspended,
        ProjectStatus.Publishing,
      ]
    );
    if (updated) {
      await this.projectEventsService.publish(updated.projectId).catch(() => undefined);
    }
  }

  async recreatePodForDeploy(envId: string, timeoutMs: number): Promise<string> {
    const env = await this.projectEnvironmentService.findById(envId);
    const podName = this.podService.assignedPodName(envId);
    await this.safeDeletePod(podName, `publish deploy for environment ${envId}`);
    await this.spawnPodForEnvironment(env);
    return this.podService.waitForReady(podName, timeoutMs);
  }

  async finishPublishDeploy(envId: string, podIp: string, deployedCommitSha: string): Promise<void> {
    const updated = await this.projectEnvironmentService.patch(
      envId,
      { status: ProjectStatus.Active, podIp, deployedCommitSha, lastActiveAt: new Date() },
      ProjectStatus.Publishing
    );
    if (!updated) {
      this.logger.warn(`finishPublishDeploy: environment ${envId} was not in 'publishing' state; leaving as-is`);
      return;
    }
    this.startupRetries.delete(envId);
    await Promise.allSettled([
      this.timeoutService.touch(envId).catch(() => undefined),
      this.projectEventsService.publish(updated.projectId).catch(() => undefined),
    ]);
  }

  async failPublishDeploy(envId: string): Promise<void> {
    const updated = await this.projectEnvironmentService.patch(
      envId,
      { status: ProjectStatus.Failed, podIp: null },
      ProjectStatus.Publishing
    );
    if (updated) {
      await this.projectEventsService.publish(updated.projectId).catch(() => undefined);
    }
  }

  async touchActivity(projectId: string): Promise<void> {
    await this.touchEnvironmentActivity(projectId, 'agent');
  }

  async touchAppActivity(projectId: string): Promise<void> {
    await this.touchEnvironmentActivity(projectId, 'app');
  }

  private async touchEnvironmentActivity(envId: string, activity: ProjectActivityKind): Promise<void> {
    if (activity === 'agent') await this.timeoutService.touch(envId);
    else await this.timeoutService.touchApp(envId);
    await this.projectEnvironmentService.touchActivity(envId);
  }

  async ensureEnvironment(
    env: ProjectEnvironmentContext,
    activity: ProjectActivityKind
  ): Promise<EnsureEnvironmentResult> {
    if (env.status === ProjectStatus.Pending || env.status === ProjectStatus.Claiming) {
      throw new NotFoundException(`Project environment ${env.id} not found`);
    }

    if (env.disabled) {
      return { state: 'disabled', env };
    }

    if (env.status === ProjectStatus.Failed) {
      return { state: 'failed', env };
    }

    if (env.status === ProjectStatus.Publishing) {
      return { state: 'starting', env };
    }

    this.recordActivity(env.id, activity);

    if (env.status === ProjectStatus.Suspended) {
      return this.wakeSuspendedEnvironment(env);
    }

    if (env.status === ProjectStatus.Starting) {
      return this.handleStartingEnvironment(env);
    }

    if (env.podIp) {
      return this.verifyCachedActiveEnvironment(env);
    }

    return this.verifyActiveEnvironment(env);
  }

  async handleProxyFailureByEnvId(envId: string): Promise<boolean> {
    const env = await this.projectEnvironmentService.findByIdOrNull(envId);
    if (!env) return false;
    return this.handleProxyFailureForEnvironment(env);
  }

  private async handleProxyFailureForEnvironment(env: ProjectEnvironmentContext): Promise<boolean> {
    if (env.disabled) return false;
    if (env.status === ProjectStatus.Failed) return false;
    if (env.status === ProjectStatus.Publishing) return false;

    if (env.status === ProjectStatus.Starting) {
      this.spawnStartupWorker(env.id);
      return true;
    }

    const podName = this.podService.assignedPodName(env.id);
    const pod = await this.readPodOrNull(podName);
    if (!pod || !this.podService.isPodReady(pod)) {
      await this.requestEnvironmentStartup(env, { deleteExistingPod: !!pod });
      return true;
    }

    const livePodIp = pod.status?.podIP ?? null;
    if (livePodIp && livePodIp !== env.podIp) {
      await this.projectEnvironmentService.patch(env.id, { podIp: livePodIp }, ProjectStatus.Active);
      this.logger.warn(`Repaired stale pod_ip for environment ${env.id}: ${env.podIp} -> ${livePodIp}`);
    }

    return false;
  }

  private async wakeSuspendedEnvironment(env: ProjectEnvironmentContext): Promise<EnsureEnvironmentResult> {
    const updated = await this.projectEnvironmentService.patch(
      env.id,
      { status: ProjectStatus.Starting, podIp: null },
      ProjectStatus.Suspended
    );

    if (updated) {
      await this.projectEventsService.publish(env.projectId);
    }

    this.spawnStartupWorker(env.id);
    return {
      state: 'starting',
      env: { ...env, status: ProjectStatus.Starting, podIp: null },
    };
  }

  private async handleStartingEnvironment(env: ProjectEnvironmentContext): Promise<EnsureEnvironmentResult> {
    const podName = this.podService.assignedPodName(env.id);
    const pod = await this.readPodOrNull(podName);

    if (!pod) {
      this.spawnStartupWorker(env.id);
      return { state: 'starting', env };
    }

    const podIp = pod.status?.podIP ?? null;
    if (this.podService.isPodReady(pod) && podIp) {
      await this.markEnvironmentActive(env.id, podIp, podName);
      return {
        state: 'ready',
        env: { ...env, status: ProjectStatus.Active, podIp },
      };
    }

    const failure = this.podService.inspectFailureReason(pod);
    if (failure === 'ImagePullBackOff') {
      await this.handleStartupFailure(
        env.id,
        podName,
        new PodStartupFailedError(podName, failure, this.podService.inspectFailureMessage(pod))
      );
      return {
        state: 'failed',
        env: { ...env, status: ProjectStatus.Failed, podIp: null },
      };
    }

    if (failure === 'Unschedulable' && this.podService.podAgeMs(pod) > UNSCHEDULABLE_STARTUP_GRACE_MS) {
      await this.handleStartupFailure(
        env.id,
        podName,
        new PodStartupFailedError(podName, failure, this.podService.inspectFailureMessage(pod))
      );
      return {
        state: 'failed',
        env: { ...env, status: ProjectStatus.Failed, podIp: null },
      };
    }

    if (failure === 'CrashLoopBackOff') {
      const ageMs = this.podService.podAgeMs(pod);
      if (ageMs > CRASH_LOOP_RECREATE_AGE_MS) {
        this.logger.warn(`Pod ${podName} stuck in CrashLoopBackOff (age=${ageMs}ms); recreating`);
        await this.safeDeletePod(podName, `CrashLoopBackOff recreate for environment ${env.id}`);
        this.spawnStartupWorker(env.id);
      }
    }

    return { state: 'starting', env };
  }

  private async verifyActiveEnvironment(env: ProjectEnvironmentContext): Promise<EnsureEnvironmentResult> {
    const podName = this.podService.assignedPodName(env.id);
    const pod = await this.readPodOrNull(podName);
    const podIp = pod?.status?.podIP ?? null;

    if (pod && this.podService.isPodReady(pod) && podIp) {
      if (podIp !== env.podIp) {
        await this.projectEnvironmentService.patch(env.id, { podIp }, ProjectStatus.Active);
      }
      return { state: 'ready', env: { ...env, podIp } };
    }

    const startingEnv = await this.requestEnvironmentStartup(env, { deleteExistingPod: !!pod });
    return { state: 'starting', env: startingEnv };
  }

  private async verifyCachedActiveEnvironment(env: ProjectEnvironmentContext): Promise<EnsureEnvironmentResult> {
    const podName = this.podService.assignedPodName(env.id);
    const snapshot = this.podService.getCachedPodSnapshot(podName);
    if (!snapshot.synced) return { state: 'ready', env };

    const pod = snapshot.pod;
    const podIp = pod?.status?.podIP ?? null;
    if (pod && this.podService.isPodReady(pod) && podIp) {
      if (podIp !== env.podIp) {
        await this.projectEnvironmentService.patch(env.id, { podIp }, ProjectStatus.Active);
      }
      return { state: 'ready', env: { ...env, podIp } };
    }

    const startingEnv = await this.requestEnvironmentStartup(env, { deleteExistingPod: !!pod });
    return { state: 'starting', env: startingEnv };
  }

  private async markEnvironmentActive(envId: string, podIp: string, podName: string): Promise<void> {
    const updated = await this.projectEnvironmentService.patch(
      envId,
      { status: ProjectStatus.Active, podIp, lastActiveAt: new Date() },
      ProjectStatus.Starting
    );

    if (!updated) {
      this.startupRetries.delete(envId);
      await this.safeDeletePod(podName, `orphan after disable/delete race for environment ${envId}`);
      return;
    }

    this.startupRetries.delete(envId);

    if (updated.isDefault) {
      this.completeDuplicateWhenAppReady(updated.projectId, envId);
    }

    await Promise.allSettled([
      this.timeoutService.touch(envId).catch((err) => {
        this.logger.warn(`Failed to touch timeout for environment ${envId}: ${(err as Error).message}`);
      }),
      this.projectEventsService.publish(updated.projectId).catch((err) => {
        this.logger.warn(`Failed to publish active event for environment ${envId}: ${(err as Error).message}`);
      }),
    ]);
    this.logger.log(`Environment ${envId} active on pod ${podName} (${podIp})`);
  }

  private async createBifrostResources(projectId: string, tenantId: string): Promise<void> {
    if (!this.bifrostService.isEnabled()) return;

    try {
      await this.bifrostService.createProjectResources({ projectId, tenantId });
    } catch (err) {
      this.logger.warn(`Failed to create Bifrost resources for project ${projectId}: ${(err as Error).message}`);
    }
  }

  private async createGatewayKey(projectId: string, environmentId: string, tenantId: string): Promise<void> {
    try {
      await this.gatewayKeyService.createKey(projectId, environmentId, tenantId);
    } catch (err) {
      this.logger.warn(`Failed to create gateway key for environment ${environmentId}: ${(err as Error).message}`);
    }
  }

  private async enqueueDuplicateJob(data: ProjectDuplicateJobData): Promise<void> {
    await this.duplicateQueue.add('copy', data, {
      jobId: data.duplicateJobId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  private async recoverDuplicateJobs(): Promise<void> {
    const activeJobs = await db
      .select()
      .from(projectDuplicateJobs)
      .where(
        inArray(projectDuplicateJobs.status, [
          ProjectDuplicateStatus.Queued,
          ProjectDuplicateStatus.Committing,
          ProjectDuplicateStatus.Cloning,
          ProjectDuplicateStatus.Copying,
          ProjectDuplicateStatus.Starting,
        ])
      );

    for (const job of activeJobs) {
      if (job.status === ProjectDuplicateStatus.Starting) {
        const env = await this.projectEnvironmentService.findByIdOrNull(job.targetProjectId);
        if (env && env.status === ProjectStatus.Active && env.podIp) {
          this.completeDuplicateWhenAppReady(job.targetProjectId, env.id);
        } else {
          this.spawnStartupWorker(job.targetProjectId);
        }
        continue;
      }

      await this.enqueueDuplicateJob({
        duplicateJobId: job.id,
        sourceProjectId: job.sourceProjectId,
        targetProjectId: job.targetProjectId,
      });
    }
  }

  private async findDuplicateOperation(projectId: string): Promise<ProjectDuplicateOperation | undefined> {
    const [job] = await db
      .select({
        status: projectDuplicateJobs.status,
        bytesTotal: projectDuplicateJobs.bytesTotal,
        bytesCopied: projectDuplicateJobs.bytesCopied,
        error: projectDuplicateJobs.error,
        startedAt: projectDuplicateJobs.startedAt,
        completedAt: projectDuplicateJobs.completedAt,
        updatedAt: projectDuplicateJobs.updatedAt,
      })
      .from(projectDuplicateJobs)
      .where(
        and(
          eq(projectDuplicateJobs.targetProjectId, projectId),
          inArray(projectDuplicateJobs.status, [
            ProjectDuplicateStatus.Queued,
            ProjectDuplicateStatus.Committing,
            ProjectDuplicateStatus.Cloning,
            ProjectDuplicateStatus.Copying,
            ProjectDuplicateStatus.Starting,
            ProjectDuplicateStatus.Failed,
          ])
        )
      );

    if (!job) return undefined;
    if (job.status === ProjectDuplicateStatus.Completed) return undefined;

    return {
      type: 'duplicate',
      status: job.status,
      bytesTotal: job.bytesTotal,
      bytesCopied: job.bytesCopied,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
    };
  }

  private async hasBlockingDuplicateOperation(projectId: string): Promise<boolean> {
    const [job] = await db
      .select({ id: projectDuplicateJobs.id })
      .from(projectDuplicateJobs)
      .where(
        and(
          eq(projectDuplicateJobs.targetProjectId, projectId),
          inArray(projectDuplicateJobs.status, [
            ProjectDuplicateStatus.Queued,
            ProjectDuplicateStatus.Committing,
            ProjectDuplicateStatus.Cloning,
            ProjectDuplicateStatus.Copying,
            ProjectDuplicateStatus.Failed,
          ])
        )
      );
    return !!job;
  }

  private async assertNoActiveGitOperation(projectId: string, executor: DbExecutor = db): Promise<void> {
    const [publishing] = await executor
      .select({ id: projectPublishJobs.id })
      .from(projectPublishJobs)
      .where(
        and(eq(projectPublishJobs.projectId, projectId), inArray(projectPublishJobs.status, ACTIVE_PUBLISH_STATUSES))
      )
      .limit(1);
    if (publishing) {
      throw new ConflictException('Cannot duplicate while a publish is in progress for this project');
    }

    const [duplicating] = await executor
      .select({ id: projectDuplicateJobs.id })
      .from(projectDuplicateJobs)
      .where(
        and(
          or(eq(projectDuplicateJobs.sourceProjectId, projectId), eq(projectDuplicateJobs.targetProjectId, projectId)),
          inArray(projectDuplicateJobs.status, ACTIVE_DUPLICATE_STATUSES)
        )
      )
      .limit(1);
    if (duplicating) {
      throw new ConflictException('A duplicate is already in progress for this project');
    }
  }

  private completeDuplicateWhenAppReady(projectId: string, envId: string): void {
    void (async () => {
      const [job] = await db
        .select({ id: projectDuplicateJobs.id })
        .from(projectDuplicateJobs)
        .where(
          and(
            eq(projectDuplicateJobs.targetProjectId, projectId),
            eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting)
          )
        )
        .limit(1);
      if (!job) return;

      const appReady = await this.appReadiness.awaitReady(envId, DUPLICATE_APP_READY_TIMEOUT_MS);

      const settled = await db
        .update(projectDuplicateJobs)
        .set(
          appReady
            ? { status: ProjectDuplicateStatus.Completed, updatedAt: new Date() }
            : {
                status: ProjectDuplicateStatus.Failed,
                error: "The duplicated app didn't come online in time. Please try again.",
                updatedAt: new Date(),
              }
        )
        .where(
          and(
            eq(projectDuplicateJobs.targetProjectId, projectId),
            eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting)
          )
        )
        .returning({ id: projectDuplicateJobs.id });

      if (settled.length > 0) {
        await this.projectEventsService.publish(projectId).catch(() => undefined);
      }
    })().catch((err) => {
      this.logger.warn(`Failed to finish duplicate for project ${projectId}: ${(err as Error).message}`);
    });
  }

  private async requestEnvironmentStartup(
    env: ProjectEnvironmentContext,
    options: { deleteExistingPod: boolean }
  ): Promise<ProjectEnvironmentContext> {
    if (env.status === ProjectStatus.Starting) {
      if (options.deleteExistingPod) {
        const podName = this.podService.assignedPodName(env.id);
        this.recreateRequests.add(env.id);
        await this.safeDeletePod(podName, `restart for environment ${env.id}`);
      }
      this.spawnStartupWorker(env.id);
      return env;
    }

    const updated = await this.projectEnvironmentService.patch(
      env.id,
      { status: ProjectStatus.Starting, podIp: null },
      [ProjectStatus.Active, ProjectStatus.Suspended, ProjectStatus.Failed]
    );

    if (!updated) {
      const current = await this.projectEnvironmentService.findById(env.id);
      if (current.status === ProjectStatus.Starting) {
        this.spawnStartupWorker(current.id);
      }
      return current;
    }

    if (options.deleteExistingPod) {
      const podName = this.podService.assignedPodName(env.id);
      this.recreateRequests.add(env.id);
      await this.safeDeletePod(podName, `restart for environment ${env.id}`);
    }

    this.spawnStartupWorker(env.id);
    await this.projectEventsService.publish(env.projectId);

    return this.projectEnvironmentService.findById(env.id);
  }

  private spawnStartupWorker(envId: string): void {
    if (this.startupTasks.has(envId)) return;
    const task = this.runStartup(envId)
      .catch((err) => {
        this.logger.warn(`Startup worker for environment ${envId} crashed: ${(err as Error).message}`);
      })
      .finally(() => {
        this.startupTasks.delete(envId);
      });
    this.startupTasks.set(envId, task);
  }

  private async runStartup(envId: string): Promise<void> {
    const current = await this.projectEnvironmentService.findByIdOrNull(envId).catch(() => null);
    if (!current || current.status !== ProjectStatus.Starting) return;
    if (current.isDefault && (await this.hasBlockingDuplicateOperation(current.projectId))) return;

    const podName = this.podService.assignedPodName(envId);
    const recreateRequested = this.recreateRequests.delete(envId);
    const existingPod = await this.readPodOrNull(podName);
    if (existingPod && !existingPod.metadata?.deletionTimestamp) {
      if (recreateRequested) {
        try {
          await this.podService.deletePod(podName);
        } catch (err) {
          await this.handleStartupFailure(envId, podName, err);
          return;
        }
      } else {
        const existingPodIp = existingPod.status?.podIP ?? null;
        if (this.podService.isPodReady(existingPod) && existingPodIp) {
          await this.markEnvironmentActive(envId, existingPodIp, podName);
          return;
        }

        const failure = this.podService.inspectFailureReason(existingPod);
        if (failure === 'ImagePullBackOff') {
          await this.handleStartupFailure(
            envId,
            podName,
            new PodStartupFailedError(podName, failure, this.podService.inspectFailureMessage(existingPod))
          );
          return;
        }
        if (failure === 'Unschedulable' && this.podService.podAgeMs(existingPod) > UNSCHEDULABLE_STARTUP_GRACE_MS) {
          await this.handleStartupFailure(
            envId,
            podName,
            new PodStartupFailedError(podName, failure, this.podService.inspectFailureMessage(existingPod))
          );
          return;
        }

        if (failure !== 'CrashLoopBackOff' || this.podService.podAgeMs(existingPod) <= CRASH_LOOP_RECREATE_AGE_MS) {
          try {
            const podIp = await this.podService.waitForReady(podName);
            await this.markEnvironmentActive(envId, podIp, podName);
          } catch (err) {
            await this.handleStartupFailure(envId, podName, err);
          }
          return;
        }

        await this.safeDeletePod(podName, `CrashLoopBackOff recreate for environment ${envId}`);
      }
    }

    if (!current.tenantId) {
      this.logger.warn(`runStartup invoked for pool environment ${envId}; skipping`);
      return;
    }

    try {
      await this.spawnPodForEnvironment(current);
      const podIp = await this.podService.waitForReady(podName);
      await this.markEnvironmentActive(envId, podIp, podName);
    } catch (err) {
      await this.handleStartupFailure(envId, podName, err);
    }
  }

  private async spawnPodForEnvironment(env: ProjectEnvironmentContext): Promise<void> {
    if (!env.tenantId) {
      throw new Error(`Cannot start pool environment ${env.id} without a tenant`);
    }

    this.appReadiness.markDown(env.id);

    const [bifrostOptions, gatewayApiKey, agentName, podResources] = await Promise.all([
      this.bifrostService.getEnvironmentPodOptions(env.id),
      this.gatewayKeyService.getEnvironmentToken(env.id),
      this.agentService.resolveName(env.agentId),
      this.podResourcesForProject(env.projectId),
    ]);

    if (this.bifrostService.isEnabled() && !bifrostOptions) {
      throw new Error(
        `No active LLM virtual keys for environment ${env.id}; refusing to start pod without credentials`
      );
    }

    const tenantOptions = {
      ...bifrostOptions,
      agentName,
      agentModel: this.agentModelByName.get(agentName),
      gatewayApiKey: gatewayApiKey ?? undefined,
      gatewayUrl: this.configService.get<string>('gatewayUrl', ''),
      opsiforceEnv: env.isDefault ? undefined : 'production',
      environmentSlug: env.environmentSlug,
      resources: podResources,
      controlToken: crypto.randomBytes(32).toString('hex'),
    };

    await this.podService.createAssignedPod(env.id, env.directory, env.projectId, tenantOptions);
  }

  private async handleStartupFailure(envId: string, podName: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : 'Project pod failed to start';
    const isPermanentFailure =
      err instanceof PodStartupFailedError && (err.reason === 'ImagePullBackOff' || err.reason === 'Unschedulable');

    this.logger.warn(`Startup failed for environment ${envId}: ${message}`);

    const env = await this.projectEnvironmentService.findByIdOrNull(envId).catch(() => null);

    const projectId = env?.projectId ?? envId;

    const duplicateFailUpdate = isPermanentFailure
      ? db
          .update(projectDuplicateJobs)
          .set({ status: ProjectDuplicateStatus.Failed, error: message, updatedAt: new Date() })
          .where(
            and(
              eq(projectDuplicateJobs.targetProjectId, projectId),
              eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting)
            )
          )
      : Promise.resolve();

    await Promise.allSettled([
      isPermanentFailure ? Promise.resolve() : this.safeDeletePod(podName, `startup failure for environment ${envId}`),
      duplicateFailUpdate,
      this.projectEventsService.publish(projectId).catch((publishErr) => {
        this.logger.warn(`Failed to publish startup failure event for ${envId}: ${(publishErr as Error).message}`);
      }),
    ]);

    if (isPermanentFailure) {
      this.startupRetries.delete(envId);
      await this.projectEnvironmentService.patch(
        envId,
        { status: ProjectStatus.Failed, podIp: null },
        ProjectStatus.Starting
      );
      await this.projectEventsService.publish(projectId).catch(() => {});
      return;
    }

    const attempts = (this.startupRetries.get(envId) ?? 0) + 1;
    this.startupRetries.set(envId, attempts);
    const delay = Math.min(STARTUP_RETRY_BASE_MS * Math.pow(2, attempts - 1), STARTUP_RETRY_MAX_MS);
    this.logger.warn(`Scheduling retry ${attempts} for environment ${envId} in ${delay}ms`);
    setTimeout(() => {
      this.spawnStartupWorker(envId);
    }, delay);
  }

  private async safeDeletePod(podName: string, context: string): Promise<void> {
    await this.podService.deletePod(podName).catch((err) => {
      this.logger.warn(`Failed to delete pod ${podName} (${context}): ${(err as Error).message}`);
    });
  }

  private async readPodOrNull(podName: string) {
    try {
      return await this.podService.getPod(podName);
    } catch (err) {
      if (this.podService.isNotFound(err)) return null;
      throw err;
    }
  }

  private recordActivity(envId: string, activity: ProjectActivityKind) {
    void this.touchEnvironmentActivity(envId, activity).catch((err) => {
      this.logger.warn(`Failed to touch ${activity} activity for environment ${envId}: ${err.message}`);
    });
  }
}

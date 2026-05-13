import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  OnApplicationBootstrap,
} from "@nestjs/common"
import { InjectQueue } from "@nestjs/bullmq"
import { ConfigService } from "@nestjs/config"
import { eq, and, desc, asc, inArray, isNull, or, ne, sql, type SQL } from "drizzle-orm"
import { Queue } from "bullmq"
import crypto from "crypto"
import { db, pgClient } from "../../db"
import {
  projectSettings,
  projects,
  pods,
  deletedProjects,
  workspaceMembers,
  workspaces,
  tenants,
  projectDuplicateJobs,
} from "../../db/schema"
import { PodService } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"
import { TimeoutService } from "../timeout/timeout.service"
import { BifrostService } from "../bifrost/bifrost.service"
import { assertPositiveMs } from "../common/validation"
import { DefaultsService } from "../defaults/defaults.service"
import { GatewayKeyService } from "../gateway/gateway-key.service"
import { ScheduleService } from "../schedule/schedule.service"
import { AgentService } from "../agent/agent.service"
import {
  CreateProjectDto,
  UpdateProjectDto,
  DuplicateProjectDto,
  ProjectResponse,
  ProjectStatus,
  ProjectState,
  ProjectAuthResponse,
  UpdateProjectAuthDto,
  ProjectDuplicateOperation,
} from "./project.types"
import { ProjectAuthService } from "./project-auth.service"
import { ProjectEventsService } from "./project-events.service"
import { AppService } from "./app.service"
import {
  PROJECT_DUPLICATE_QUEUE,
  ProjectDuplicateStatus,
  type ProjectDuplicateJobData,
} from "./project-duplicate.types"

type ProjectActivityKind = "agent" | "app"

export interface EnsureProjectResult {
  state: "ready" | "starting" | "disabled"
  project: ProjectResponse
}

// Common orderBy for project listings: active projects first, most-recent activity first.
const projectOrderBy = () =>
  [
    asc(sql`CASE WHEN ${projects.status} = 'disabled' THEN 1 ELSE 0 END`),
    desc(projects.lastActiveAt),
    desc(projects.createdAt),
  ] as const

const projectSelectFields = {
  id: projects.id,
  tenantId: projects.tenantId,
  workspaceId: projects.workspaceId,
  agentId: projects.agentId,
  title: projects.title,
  description: projects.description,
  directory: projects.directory,
  status: projects.status,
  podName: projects.podName,
  podIp: projects.podIp,
  sessionId: projects.sessionId,
  platformVersion: projects.platformVersion,
  bifrostProjectId: projects.bifrostProjectId,
  timeoutIdle: projectSettings.timeoutIdle,
  appTimeoutIdle: projectSettings.appTimeoutIdle,
  timezone: projectSettings.timezone,
  authMode: projectSettings.authMode,
  lastActiveAt: projects.lastActiveAt,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
}

@Injectable()
export class ProjectService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectService.name)
  private readonly startupTasks = new Map<string, Promise<void>>()

  constructor(
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
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
    @Inject(forwardRef(() => AppService))
    private readonly appService: AppService,
    private readonly agentService: AgentService,
    @InjectQueue(PROJECT_DUPLICATE_QUEUE)
    private readonly duplicateQueue: Queue<ProjectDuplicateJobData>,
  ) {}

  async onApplicationBootstrap() {
    await this.reconcileProjects().catch((err) => {
      this.logger.warn(`Failed to reconcile projects on startup: ${err.message}`)
    })
    await this.recoverDuplicateJobs().catch((err) => {
      this.logger.warn(`Failed to recover duplicate jobs on startup: ${err.message}`)
    })
  }


  async create(
    dto: CreateProjectDto | undefined,
    tenantId: string,
    workspaceId: string | null = null,
  ): Promise<ProjectResponse> {
    const id = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
    const podName = this.podService.assignedPodName(id)
    const agentId = dto?.agentId ?? (await this.agentService.getDefaultAgentId())
    const { defaultTimeoutIdle: timeoutIdle, defaultAppTimeoutIdle: appTimeoutIdle } =
      await this.defaultsService.getTenantTimeouts(tenantId)

    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id,
        tenantId,
        workspaceId,
        agentId,
        title: dto?.title ?? null,
        description: dto?.description ?? null,
        directory,
        status: ProjectStatus.Starting,
        podName,
        podIp: null,
        platformVersion,
      })

      await tx.insert(projectSettings).values({
        projectId: id,
        timeoutIdle,
        appTimeoutIdle,
        timezone: dto?.timezone || "UTC",
      })
    })

    await this.createBifrostResources(id, tenantId)
    await this.createGatewayKey(id, tenantId)
    this.queueProjectStartup(id)

    return this.findOne(id, tenantId)
  }

  async duplicate(sourceId: string, tenantId: string, dto?: DuplicateProjectDto): Promise<ProjectResponse> {
    const source = await this.findOne(sourceId, tenantId)

    const id = crypto.randomUUID()
    const duplicateJobId = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
    const podName = this.podService.assignedPodName(id)
    const title = dto?.title ?? (source.title ? `${source.title} (copy)` : null)

    await db.transaction(async (tx) => {
      await tx.insert(projects).values({
        id,
        tenantId,
        workspaceId: source.workspaceId,
        agentId: source.agentId,
        title,
        description: source.description,
        directory,
        status: ProjectStatus.Starting,
        podName,
        podIp: null,
        platformVersion,
      })

      await tx.insert(projectSettings).values({
        projectId: id,
        timeoutIdle: source.timeoutIdle,
        appTimeoutIdle: source.appTimeoutIdle,
        timezone: source.timezone,
      })

      await tx.insert(projectDuplicateJobs).values({
        id: duplicateJobId,
        sourceProjectId: source.id,
        targetProjectId: id,
        tenantId,
        status: ProjectDuplicateStatus.Queued,
      })
    })

    await this.createBifrostResources(id, tenantId)
    await this.createGatewayKey(id, tenantId)
    await this.enqueueDuplicateJob({
      duplicateJobId,
      sourceProjectId: source.id,
      targetProjectId: id,
    })
    await this.projectEventsService.publish(id)

    return this.findOne(id, tenantId)
  }

  async ensureProjectById(projectId: string, activity: ProjectActivityKind): Promise<EnsureProjectResult> {
    const project = await this.findOneById(projectId)
    return this.ensureProjectAccess(project, activity)
  }

  async findAll(tenantId: string): Promise<ProjectResponse[]> {
    return this.selectProjects(eq(projects.tenantId, tenantId))
  }

  async findAllForUser(params: {
    tenantId: string
    userId: string
  }): Promise<ProjectResponse[]> {
    const { tenantId, userId } = params

    return db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .leftJoin(
        workspaceMembers,
        and(eq(workspaceMembers.workspaceId, projects.workspaceId), eq(workspaceMembers.userId, userId)),
      )
      .where(
        and(
          eq(projects.tenantId, tenantId),
          or(isNull(projects.workspaceId), sql`${workspaceMembers.workspaceId} is not null`),
        ),
      )
      .orderBy(...projectOrderBy())
  }

  async findAllInWorkspace(tenantId: string, workspaceId: string): Promise<ProjectResponse[]> {
    return this.selectProjects(and(eq(projects.tenantId, tenantId), eq(projects.workspaceId, workspaceId))!)
  }

  private selectProjects(where: SQL): Promise<ProjectResponse[]> {
    return db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .where(where)
      .orderBy(...projectOrderBy())
  }

  async findOne(id: string, tenantId: string): Promise<ProjectResponse> {
    const [project] = await db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  
  async findOneForUser(params: {
    projectId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
  }): Promise<ProjectResponse> {
    const { projectId, tenantId, userId, canManageWorkspaces } = params
    const project = await this.findOne(projectId, tenantId)
    await this.assertProjectVisibleToUser(
      project.id,
      project.workspaceId,
      userId,
      canManageWorkspaces,
    )
    return project
  }


  private async assertProjectVisibleToUser(
    projectId: string,
    workspaceId: string | null,
    userId: string,
    canManageWorkspaces: boolean,
  ): Promise<void> {
    if (!workspaceId) return

    const [ws] = await db
      .select({ type: workspaces.type, ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))

    if (!ws) return

    if (ws.type === "private") {
      if (ws.ownerId !== userId) {
        throw new NotFoundException(`Project ${projectId} not found`)
      }
      return
    }

    if (canManageWorkspaces) return

    const [member] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
    if (!member) {
      throw new NotFoundException(`Project ${projectId} not found`)
    }
  }

  async getState(params: {
    projectId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
  }): Promise<ProjectState> {
    const { projectId, tenantId, userId, canManageWorkspaces } = params

    const [row] = await db
      .select({
        id: projects.id,
        status: projects.status,
        workspaceId: projects.workspaceId,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))

    if (!row) throw new NotFoundException(`Project ${projectId} not found`)

    await this.assertProjectVisibleToUser(row.id, row.workspaceId, userId, canManageWorkspaces)

    const status = row.status as ProjectStatus
    const operation = await this.findDuplicateOperation(row.id)
    const app = status === ProjectStatus.Active ? this.appService.get(row.id) : null
    return {
      id: row.id,
      status,
      workspaceId: row.workspaceId,
      operation: operation ?? null,
      app,
    }
  }

  async findOneById(id: string): Promise<ProjectResponse> {
    const [project] = await db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .where(eq(projects.id, id))

    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  async update(id: string, dto: UpdateProjectDto, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)
    const now = new Date()
    const projectUpdates: Partial<typeof projects.$inferInsert> = {}
    const settingsUpdates: Partial<typeof projectSettings.$inferInsert> = {}

    if (dto.title !== undefined) projectUpdates.title = dto.title
    if (dto.description !== undefined) projectUpdates.description = dto.description
    if (dto.timeoutIdle !== undefined) settingsUpdates.timeoutIdle = assertPositiveMs(dto.timeoutIdle, "timeoutIdle")
    if (dto.appTimeoutIdle !== undefined)
      settingsUpdates.appTimeoutIdle = assertPositiveMs(dto.appTimeoutIdle, "appTimeoutIdle")
    if (dto.timezone !== undefined) settingsUpdates.timezone = dto.timezone

    await db.transaction(async (tx) => {
      if (Object.keys(projectUpdates).length > 0 || Object.keys(settingsUpdates).length > 0) {
        await tx
          .update(projects)
          .set({ ...projectUpdates, updatedAt: now })
          .where(eq(projects.id, project.id))
      }

      if (Object.keys(settingsUpdates).length > 0) {
        await tx.update(projectSettings).set(settingsUpdates).where(eq(projectSettings.projectId, project.id))
      }
    })

    if (dto.timeoutIdle !== undefined) {
      await this.timeoutService.touch(id).catch((err) => {
        this.logger.warn(`Failed to refresh agent timeout for project ${id}: ${(err as Error).message}`)
      })
    }
    if (dto.appTimeoutIdle !== undefined) {
      await this.timeoutService.touchApp(id).catch((err) => {
        this.logger.warn(`Failed to refresh app timeout for project ${id}: ${(err as Error).message}`)
      })
    }

    return this.findOne(id, tenantId)
  }

  async getAuth(id: string, tenantId: string): Promise<ProjectAuthResponse> {
    const project = await this.findOne(id, tenantId)
    if (project.authMode === "public") return { mode: "public" }
    const { config, bypassAuthPaths } = await this.projectAuthService.getConfig(id)
    if (project.authMode === "makara") return { mode: "makara", bypassAuthPaths }
    return { mode: "manual", config, bypassAuthPaths }
  }

  async updateAuth(id: string, dto: UpdateProjectAuthDto, tenantId: string): Promise<ProjectAuthResponse> {
    const project = await this.findOne(id, tenantId)
    if (dto.mode !== "public" && dto.mode !== "manual" && dto.mode !== "makara") {
      throw new BadRequestException(`Unknown auth mode: ${dto.mode}`)
    }

    if (dto.mode === "manual") {
      await this.projectAuthService.apply(project.id, dto.config ?? {}, dto.bypassAuthPaths)
    } else if (dto.mode === "makara") {
      const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId))
      if (!tenant) throw new BadRequestException(`Tenant ${tenantId} not found`)
      await this.projectAuthService.applyMakara(project.id, tenant.name, dto.bypassAuthPaths)
    } else {
      await this.projectAuthService.remove(project.id)
    }

    await db.update(projectSettings).set({ authMode: dto.mode }).where(eq(projectSettings.projectId, project.id))

    return this.getAuth(id, tenantId)
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId)
    const podName = project.podName ?? this.podService.assignedPodName(id)

    await this.podService.deletePod(podName).catch(() => {})
    await this.deleteProjectPods(id, podName)

    if (this.bifrostService.isEnabled()) {
      await this.bifrostService.revokeProjectKeys(id).catch((err) => {
        this.logger.warn(`Failed to revoke Bifrost keys for project ${id}: ${(err as Error).message}`)
      })
    }

    await this.gatewayKeyService.revokeKeys(id).catch((err) => {
      this.logger.warn(`Failed to revoke gateway keys for project ${id}: ${(err as Error).message}`)
    })

    await this.scheduleService.removeAllForProject(id).catch((err) => {
      this.logger.warn(`Failed to remove schedules for project ${id}: ${(err as Error).message}`)
    })
    await this.timeoutService.clear(id)
    await db.delete(projects).where(eq(projects.id, id))
    this.startupTasks.delete(id)
    await this.podPoolService.replenish().catch((err) => {
      this.logger.warn(`Failed to replenish warm pool after deleting project ${id}: ${err.message}`)
    })
    await db
      .insert(deletedProjects)
      .values({
        id: project.id,
        tenantId: project.tenantId,
        directory: project.directory,
      })
      .onConflictDoNothing()
  }

  async disable(id: string, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)
    if (project.status === ProjectStatus.Disabled) {
      throw new BadRequestException("Project is already disabled")
    }

    if (project.podName) {
      await this.podService.deletePod(project.podName).catch(() => {})
      await this.deleteProjectPods(id, project.podName)
    }

    await this.timeoutService.clear(id)
    this.startupTasks.delete(id)

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Disabled,
        podName: null,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
    this.appService.invalidate(id)
    await this.projectEventsService.publish(id)

    await this.podPoolService.replenish().catch((err) => {
      this.logger.warn(`Failed to replenish warm pool after disabling project ${id}: ${err.message}`)
    })

    return this.findOne(id, tenantId)
  }

  async enable(id: string, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)
    if (project.status !== ProjectStatus.Disabled) {
      throw new BadRequestException("Project is not disabled")
    }

    const podName = this.podService.assignedPodName(id)
    await db
      .update(projects)
      .set({
        status: ProjectStatus.Starting,
        podName,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))

    this.queueProjectStartup(id)
    await this.projectEventsService.publish(id)
    return this.findOne(id, tenantId)
  }

  async reassignPod(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId)
    await this.requestProjectStartup(project, { deleteExistingPod: true })
  }

  async restart(id: string, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)
    if (project.status === ProjectStatus.Disabled) {
      throw new BadRequestException("Disabled project cannot be restarted")
    }

    await this.requestProjectStartup(project, { deleteExistingPod: true })
    return this.findOne(id, tenantId)
  }

  async reassignPodById(id: string): Promise<void> {
    const project = await this.findOneById(id)
    await this.requestProjectStartup(project, { deleteExistingPod: true })
  }

  async touchActivity(projectId: string): Promise<void> {
    await this.timeoutService.touch(projectId)
    await db.update(projects).set({ lastActiveAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, projectId))
  }

  async touchAppActivity(projectId: string): Promise<void> {
    await this.timeoutService.touchApp(projectId)
    await db.update(projects).set({ lastActiveAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, projectId))
  }

  async ensureProjectAccess(project: ProjectResponse, activity: ProjectActivityKind): Promise<EnsureProjectResult> {
    if (project.status === ProjectStatus.Disabled) {
      return { state: "disabled", project }
    }

    this.recordActivity(project.id, activity)

    if (project.status === ProjectStatus.Starting) {
      this.queueProjectStartup(project.id)
      return { state: "starting", project }
    }

    if (project.status === ProjectStatus.Active && project.podName) {
      if (project.podIp) {
        return { state: "ready", project }
      }

      const pod = await this.podService.getPod(project.podName).catch(() => null)
      if (pod && this.podService.isPodReady(pod)) {
        const podIp = pod.status?.podIP ?? null
        if (podIp) {
          await Promise.all([
            this.ensureAssignedPodRow(project.id, project.podName, podIp),
            db.update(projects).set({ podIp, updatedAt: new Date() }).where(eq(projects.id, project.id)),
          ])
          return { state: "ready", project: { ...project, podIp } }
        }
      }

      const startingProject = await this.requestProjectStartup(project, {
        deleteExistingPod: !!pod,
      })
      return { state: "starting", project: startingProject }
    }

    const startingProject = await this.requestProjectStartup(project, {
      deleteExistingPod: false,
    })
    return { state: "starting", project: startingProject }
  }

  async handleProxyFailure(projectId: string, tenantId: string): Promise<boolean> {
    return this.handleProxyFailureForProject(await this.findOne(projectId, tenantId))
  }

  async handleProxyFailureById(projectId: string): Promise<boolean> {
    return this.handleProxyFailureForProject(await this.findOneById(projectId))
  }

  private async handleProxyFailureForProject(project: ProjectResponse): Promise<boolean> {
    if (project.status === ProjectStatus.Disabled) return false

    if (project.status === ProjectStatus.Starting) {
      this.queueProjectStartup(project.id)
      return true
    }

    if (project.status !== ProjectStatus.Active || !project.podName) {
      await this.requestProjectStartup(project, { deleteExistingPod: false })
      return true
    }

    const pod = await this.podService.getPod(project.podName).catch(() => null)
    if (!pod || !this.podService.isPodReady(pod)) {
      await this.requestProjectStartup(project, { deleteExistingPod: !!pod })
      return true
    }

    return false
  }

  private async createBifrostResources(projectId: string, tenantId: string): Promise<void> {
    if (!this.bifrostService.isEnabled()) return

    try {
      await this.bifrostService.createProjectResources(projectId, tenantId)
    } catch (err) {
      this.logger.warn(`Failed to create Bifrost resources for project ${projectId}: ${(err as Error).message}`)
    }
  }

  private async createGatewayKey(projectId: string, tenantId: string): Promise<void> {
    try {
      await this.gatewayKeyService.createKey(projectId, tenantId)
    } catch (err) {
      this.logger.warn(`Failed to create gateway key for project ${projectId}: ${(err as Error).message}`)
    }
  }

  private async enqueueDuplicateJob(data: ProjectDuplicateJobData): Promise<void> {
    await this.duplicateQueue.add("copy", data, {
      jobId: data.duplicateJobId,
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    })
  }

  private async recoverDuplicateJobs(): Promise<void> {
    const activeJobs = await db
      .select()
      .from(projectDuplicateJobs)
      .where(
        inArray(projectDuplicateJobs.status, [
          ProjectDuplicateStatus.Queued,
          ProjectDuplicateStatus.Copying,
          ProjectDuplicateStatus.Starting,
        ]),
      )

    for (const job of activeJobs) {
      if (job.status === ProjectDuplicateStatus.Starting) {
        this.queueProjectStartup(job.targetProjectId)
        continue
      }

      await this.enqueueDuplicateJob({
        duplicateJobId: job.id,
        sourceProjectId: job.sourceProjectId,
        targetProjectId: job.targetProjectId,
      })
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
            ProjectDuplicateStatus.Copying,
            ProjectDuplicateStatus.Starting,
            ProjectDuplicateStatus.Failed,
          ]),
        ),
      )

    if (!job) return undefined
    if (job.status === ProjectDuplicateStatus.Completed) return undefined

    return {
      type: "duplicate",
      status: job.status,
      bytesTotal: job.bytesTotal,
      bytesCopied: job.bytesCopied,
      error: job.error,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      updatedAt: job.updatedAt,
    }
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
            ProjectDuplicateStatus.Copying,
            ProjectDuplicateStatus.Failed,
          ]),
        ),
      )
    return !!job
  }

  private async requestProjectStartup(
    project: ProjectResponse,
    options: { deleteExistingPod: boolean },
  ): Promise<ProjectResponse> {
    if (project.status === ProjectStatus.Starting) {
      this.queueProjectStartup(project.id)
      return project
    }

    const podName = this.podService.assignedPodName(project.id)
    const [updated] = await db
      .update(projects)
      .set({
        status: ProjectStatus.Starting,
        podName,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(projects.id, project.id), inArray(projects.status, [ProjectStatus.Active, ProjectStatus.Suspended])),
      )
      .returning()

    if (!updated) {
      const current = await this.findOneById(project.id)
      if (current.status === ProjectStatus.Starting) {
        this.queueProjectStartup(current.id)
      }
      return current
    }

    if (options.deleteExistingPod) {
      const podNames = Array.from(new Set([project.podName, podName].filter((name): name is string => !!name)))
      await Promise.all(podNames.map((name) => this.podService.deletePod(name).catch(() => {})))
    }

    await this.deleteProjectPods(project.id, podName)
    this.queueProjectStartup(project.id)
    this.appService.invalidate(project.id)
    await this.projectEventsService.publish(project.id)

    return this.findOneById(project.id)
  }

  queueProjectStartup(projectId: string) {
    if (this.startupTasks.has(projectId)) return

    const task = this.startProject(projectId)
      .catch((err) => {
        this.logger.warn(`Failed to start project ${projectId}: ${err.message}`)
      })
      .finally(() => {
        this.startupTasks.delete(projectId)
      })

    this.startupTasks.set(projectId, task)
  }

  private async startProject(projectId: string): Promise<void> {
    await this.withProjectStartupLock(projectId, async () => {
      if (await this.hasBlockingDuplicateOperation(projectId)) return

      const current = await this.findOneById(projectId).catch(() => null)
      if (!current || current.status !== ProjectStatus.Starting) return

      const [bifrostOptions, agentDefaults, gatewayApiKey, agentName] = await Promise.all([
        this.bifrostService.getProjectPodOptions(projectId),
        this.defaultsService.getTenantAgent(current.tenantId),
        this.gatewayKeyService.getProjectToken(projectId),
        this.agentService.resolveName(current.agentId),
      ])
      const tenantOptions = {
        ...(bifrostOptions ?? {}),
        agentName,
        agentModel: agentDefaults.defaultModel,
        gatewayApiKey: gatewayApiKey ?? undefined,
        gatewayUrl: this.configService.get<string>("gatewayUrl", ""),
      }
      const claimedPod = await this.podPoolService.claimWarmPod()
      const podName = current.podName ?? this.podService.assignedPodName(projectId)

      try {
        await Promise.all([
          this.podService.deletePod(podName).catch(() => {}),
          claimedPod ? this.podService.deletePod(claimedPod.podName).catch(() => {}) : Promise.resolve(),
        ])

        if (current.podName !== podName || current.podIp !== null) {
          await db
            .update(projects)
            .set({ podName, podIp: null, updatedAt: new Date() })
            .where(eq(projects.id, projectId))
        }

        await this.deleteProjectPods(projectId, podName)
        await this.podService.createAssignedPod(projectId, current.directory, tenantOptions)
        await this.ensureAssignedPodRow(projectId, podName, null)

        const podIp = await this.podService.waitForReady(podName)
        await this.setProjectActive(projectId, podName, podIp)
      } catch (err) {
        await this.handleStartupFailure(projectId, podName, err)
        throw err
      }
    })
  }

  private async setProjectActive(projectId: string, podName: string, podIp: string): Promise<void> {
    const [project] = await db
      .update(projects)
      .set({
        status: ProjectStatus.Active,
        podName,
        podIp,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning()

    if (!project) throw new NotFoundException(`Project ${projectId} not found`)

    await this.ensureAssignedPodRow(projectId, podName, podIp)
    await this.timeoutService.touch(projectId)
    await db
      .update(projectDuplicateJobs)
      .set({
        status: ProjectDuplicateStatus.Completed,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projectDuplicateJobs.targetProjectId, projectId),
          eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting),
        ),
      )
    await this.projectEventsService.publish(projectId)
    this.logger.log(`Project ${projectId} active on pod ${podName} (${podIp})`)
  }

  private async handleStartupFailure(projectId: string, podName: string, error: unknown): Promise<void> {
    await this.podService.deletePod(podName).catch(() => {})
    await this.deleteProjectPods(projectId, podName)

    const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId))

    if (!project) return

    const now = new Date()
    const message = error instanceof Error ? error.message : "Project pod failed to start"

    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          status: ProjectStatus.Suspended,
          podName: null,
          podIp: null,
          updatedAt: now,
        })
        .where(eq(projects.id, projectId))

      await tx
        .update(projectDuplicateJobs)
        .set({
          status: ProjectDuplicateStatus.Failed,
          error: message,
          updatedAt: now,
        })
        .where(
          and(
            eq(projectDuplicateJobs.targetProjectId, projectId),
            eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting),
          ),
        )
    })
    this.appService.invalidate(projectId)
    await this.projectEventsService.publish(projectId)
  }

  private async ensureAssignedPodRow(projectId: string, podName: string, podIp: string | null): Promise<void> {
    await db.delete(pods).where(and(eq(pods.projectId, projectId), ne(pods.podName, podName)))

    await db
      .insert(pods)
      .values({
        id: crypto.randomUUID(),
        podName,
        status: "assigned",
        projectId,
        podIp,
      })
      .onConflictDoUpdate({
        target: pods.podName,
        set: {
          status: "assigned",
          projectId,
          podIp,
          updatedAt: new Date(),
        },
      })
  }

  private async deleteProjectPods(projectId: string, podName?: string): Promise<void> {
    if (podName) {
      await db.delete(pods).where(or(eq(pods.projectId, projectId), eq(pods.podName, podName)))
      return
    }

    await db.delete(pods).where(eq(pods.projectId, projectId))
  }

  private recordActivity(projectId: string, activity: ProjectActivityKind) {
    const touch = activity === "agent" ? this.touchActivity(projectId) : this.touchAppActivity(projectId)

    void touch.catch((err) => {
      this.logger.warn(`Failed to touch ${activity} activity for project ${projectId}: ${err.message}`)
    })
  }

  private async withProjectStartupLock(projectId: string, run: () => Promise<void>): Promise<void> {
    const connection = await pgClient.reserve()
    let locked = false

    try {
      const [result] = await connection.unsafe<Array<{ locked: boolean }>>(
        "select pg_try_advisory_lock(hashtext($1), hashtext($2)) as locked",
        ["opsiforce-project-startup", projectId],
      )
      locked = result?.locked ?? false

      if (!locked) {
        this.logger.debug(`Startup already in progress for project ${projectId}`)
        return
      }

      await run()
    } finally {
      if (locked) {
        await connection
          .unsafe("select pg_advisory_unlock(hashtext($1), hashtext($2))", ["opsiforce-project-startup", projectId])
          .catch((err) => {
            this.logger.warn(`Failed to release startup lock for project ${projectId}: ${err.message}`)
          })
      }

      connection.release()
    }
  }

  private async reconcileProjects(): Promise<void> {
    const candidateProjects = await db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .where(inArray(projects.status, [ProjectStatus.Starting, ProjectStatus.Active]))

    await Promise.allSettled(candidateProjects.map((project) => this.reconcileProject(project)))
  }

  private async reconcileProject(project: ProjectResponse): Promise<void> {
    if (project.status === ProjectStatus.Starting) {
      if (!project.podName) {
        this.queueProjectStartup(project.id)
        return
      }

      const pod = await this.podService.getPod(project.podName).catch(() => null)
      if (!pod) {
        this.queueProjectStartup(project.id)
        return
      }

      const podIp = pod.status?.podIP ?? null
      await this.ensureAssignedPodRow(project.id, project.podName, podIp)

      if (podIp && this.podService.isPodReady(pod)) {
        await this.setProjectActive(project.id, project.podName, podIp)
      }

      return
    }

    if (!project.podName) {
      await this.requestProjectStartup(project, { deleteExistingPod: false })
      return
    }

    const pod = await this.podService.getPod(project.podName).catch(() => null)
    if (!pod) {
      await this.requestProjectStartup(project, { deleteExistingPod: false })
      return
    }

    if (!this.podService.isPodReady(pod)) {
      await this.requestProjectStartup(project, { deleteExistingPod: true })
      return
    }

    const podIp = pod.status?.podIP ?? null
    await this.ensureAssignedPodRow(project.id, project.podName, podIp)

    if (podIp && podIp !== project.podIp) {
      await db.update(projects).set({ podIp, updatedAt: new Date() }).where(eq(projects.id, project.id))
    }
  }
}

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
import { eq, and, desc, asc, inArray, isNull, or, sql, type SQL } from "drizzle-orm"
import { Queue } from "bullmq"
import crypto from "crypto"
import path from "path"
import { rename, writeFile } from "fs/promises"
import { db } from "../../db"
import {
  projectSettings,
  projects,
  projectApps,
  deletedProjects,
  workspaceMembers,
  workspaces,
  tenants,
  tenantSettings,
  projectDuplicateJobs,
} from "../../db/schema"
import { PodService, PodStartupFailedError } from "../pod/pod.service"
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
  UpdateAppDto,
} from "./project.types"

// TODO: replace these hand-rolled validators with zod schemas once zod is introduced.
const APP_NAME_MIN_LENGTH = 1
const APP_NAME_MAX_LENGTH = 80
const APP_DESCRIPTION_MAX_LENGTH = 500
const CRASH_LOOP_RECREATE_AGE_MS = 60 * 1000
const STARTUP_RETRY_BASE_MS = 5 * 1000
const STARTUP_RETRY_MAX_MS = 5 * 60 * 1000

interface AppMetaPatch {
  name?: string
  description?: string | null
}

function validateUpdateAppDto(body: UpdateAppDto): AppMetaPatch {
  const patch: AppMetaPatch = {}

  if ("name" in body) patch.name = validateAppName(body.name)
  if ("description" in body) patch.description = validateAppDescription(body.description)

  if (!("name" in patch) && !("description" in patch)) {
    throw new BadRequestException("At least one of 'name' or 'description' must be provided")
  }

  return patch
}

function validateAppName(value: unknown): string {
  if (typeof value !== "string") {
    throw new BadRequestException("'name' must be a string")
  }
  const trimmed = value.trim()
  if (trimmed.length < APP_NAME_MIN_LENGTH || trimmed.length > APP_NAME_MAX_LENGTH) {
    throw new BadRequestException(
      `'name' must be ${APP_NAME_MIN_LENGTH}-${APP_NAME_MAX_LENGTH} characters after trimming`,
    )
  }
  return trimmed
}

function validateAppDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") {
    throw new BadRequestException("'description' must be a string or null")
  }
  const trimmed = value.trim()
  if (trimmed.length > APP_DESCRIPTION_MAX_LENGTH) {
    throw new BadRequestException(
      `'description' must be at most ${APP_DESCRIPTION_MAX_LENGTH} characters after trimming`,
    )
  }
  return trimmed.length === 0 ? null : trimmed
}
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
  state: "ready" | "starting" | "disabled" | "failed"
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
  podIp: projects.podIp,
  sessionId: projects.sessionId,
  platformVersion: projects.platformVersion,
  bifrostProjectId: projects.bifrostProjectId,
  timeoutIdle: projectSettings.timeoutIdle,
  appTimeoutIdle: projectSettings.appTimeoutIdle,
  timezone: projectSettings.timezone,
  authMode: projectSettings.authMode,
  isPinned: sql<boolean>`coalesce(${projectApps.isPinned}, false)`.as("is_pinned"),
  pinnedAt: projectApps.pinnedAt,
  hasApp: sql<boolean>`${projectApps.projectId} is not null`.as("has_app"),
  appName: projectApps.name,
  appDescription: projectApps.description,
  lastActiveAt: projects.lastActiveAt,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
}

@Injectable()
export class ProjectService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectService.name)
  private readonly startupTasks = new Map<string, Promise<void>>()
  private readonly startupRetries = new Map<string, number>()
  private readonly recreateRequests = new Set<string>()

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
    await this.cleanupOrphanedAssignedPods().catch((err) => {
      this.logger.warn(`Failed to clean up orphaned assigned pods: ${err.message}`)
    })
    await this.recoverDuplicateJobs().catch((err) => {
      this.logger.warn(`Failed to recover duplicate jobs on startup: ${err.message}`)
    })
    await this.resumeStartingProjects().catch((err) => {
      this.logger.warn(`Failed to resume starting projects: ${err.message}`)
    })
  }

  private async resumeStartingProjects(): Promise<void> {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.status, ProjectStatus.Starting))

    for (const { id } of rows) {
      this.spawnStartupWorker(id)
    }

    if (rows.length > 0) {
      this.logger.log(`Resumed startup workers for ${rows.length} project(s) in 'starting' state`)
    }
  }

  private async cleanupOrphanedAssignedPods(): Promise<void> {
    const assignedPods = await this.podService.listPods("app=opsiforce-agent,opsiforce.io/pool=assigned")
    const podRefs = assignedPods
      .map((pod) => ({
        name: pod.metadata?.name ?? null,
        projectId: pod.metadata?.labels?.["opsiforce.io/project-id"] ?? null,
      }))
      .filter((pod): pod is { name: string; projectId: string } => !!pod.name && !!pod.projectId)

    if (podRefs.length === 0) return

    const projectIds = Array.from(new Set(podRefs.map((pod) => pod.projectId)))
    const existingRows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(inArray(projects.id, projectIds))
    const existingIds = new Set(existingRows.map((project) => project.id))
    const orphanedPods = podRefs.filter((pod) => !existingIds.has(pod.projectId))

    await Promise.allSettled(
      orphanedPods.map((pod) => {
        this.logger.warn(`Deleting orphaned assigned pod ${pod.name} for missing project ${pod.projectId}`)
        return this.safeDeletePod(pod.name, `orphaned project ${pod.projectId}`)
      }),
    )
  }


  async create(
    dto: CreateProjectDto | undefined,
    tenantId: string,
    workspaceId: string | null = null,
  ): Promise<ProjectResponse> {
    const id = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
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
    this.spawnStartupWorker(id)

    return this.findOne(id, tenantId)
  }

  async duplicate(sourceId: string, tenantId: string, dto?: DuplicateProjectDto): Promise<ProjectResponse> {
    const source = await this.findOne(sourceId, tenantId)

    const id = crypto.randomUUID()
    const duplicateJobId = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
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
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
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
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
      .where(where)
      .orderBy(...projectOrderBy())
  }

  async findOne(id: string, tenantId: string): Promise<ProjectResponse> {
    const [project] = await db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }


  async findOneForUser(params: {
    projectId: string
    tenantId: string
    userId: string
  }): Promise<ProjectResponse> {
    const { projectId, tenantId, userId } = params
    const project = await this.findOne(projectId, tenantId)
    await this.assertProjectVisibleToUser(project.id, project.workspaceId, userId)
    return project
  }


  private async assertProjectVisibleToUser(
    projectId: string,
    workspaceId: string | null,
    userId: string,
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
  }): Promise<ProjectState> {
    const { projectId, tenantId, userId } = params

    const [row] = await db
      .select({
        id: projects.id,
        status: projects.status,
        workspaceId: projects.workspaceId,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))

    if (!row) throw new NotFoundException(`Project ${projectId} not found`)

    await this.assertProjectVisibleToUser(row.id, row.workspaceId, userId)

    const status = row.status as ProjectStatus
    const operation = await this.findDuplicateOperation(row.id)
    const app = status === ProjectStatus.Active ? await this.appService.get(row.id) : null
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
      .leftJoin(projectApps, eq(projectApps.projectId, projects.id))
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
      const makaraTenantName = await this.findMakaraTenantName(tenantId)
      await this.projectAuthService.applyMakara(project.id, makaraTenantName, dto.bypassAuthPaths)
    } else {
      await this.projectAuthService.remove(project.id)
    }

    await db.update(projectSettings).set({ authMode: dto.mode }).where(eq(projectSettings.projectId, project.id))

    return this.getAuth(id, tenantId)
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId)
    const podName = this.podService.assignedPodName(id)

    this.appService.stopPolling(id)
    this.appService.invalidate(id)

    await Promise.allSettled([
      this.safeDeletePod(podName, `removing project ${id}`),
      this.bifrostService.isEnabled()
        ? this.bifrostService.revokeProjectKeys(id).catch((err) => {
            this.logger.warn(`Failed to revoke Bifrost keys for project ${id}: ${(err as Error).message}`)
          })
        : Promise.resolve(),
      this.gatewayKeyService.revokeKeys(id).catch((err) => {
        this.logger.warn(`Failed to revoke gateway keys for project ${id}: ${(err as Error).message}`)
      }),
      this.scheduleService.removeAllForProject(id).catch((err) => {
        this.logger.warn(`Failed to remove schedules for project ${id}: ${(err as Error).message}`)
      }),
      this.timeoutService.clear(id),
    ])

    await db.delete(projects).where(eq(projects.id, id))
    await db
      .insert(deletedProjects)
      .values({
        id: project.id,
        tenantId: project.tenantId,
        directory: project.directory,
      })
      .onConflictDoNothing()
    await this.podPoolService.replenish().catch((err) => {
      this.logger.warn(`Failed to replenish warm pool after deleting project ${id}: ${err.message}`)
    })
  }

  async disable(id: string, tenantId: string): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)
    if (project.status === ProjectStatus.Disabled) {
      throw new BadRequestException("Project is already disabled")
    }

    const podName = this.podService.assignedPodName(id)

    await Promise.allSettled([
      this.safeDeletePod(podName, `disabling project ${id}`),
      this.timeoutService.clear(id),
    ])

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Disabled,
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

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Starting,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))

    this.spawnStartupWorker(id)
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

  async updateApp(id: string, tenantId: string, body: UpdateAppDto): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)
    if (!project.hasApp) {
      throw new BadRequestException(
        "APP_NOT_DETECTED: this project has no detectable app yet. Make sure the project's web server is running and serves /api/app-meta before editing app details.",
      )
    }

    const patch = validateUpdateAppDto(body)
    const current = (await this.appService.get(id)) ?? { name: null, description: null }
    const name = patch.name ?? current.name
    const description = "description" in patch ? patch.description ?? null : current.description

    if (!name) {
      throw new BadRequestException("'name' is required and cannot be empty")
    }

    await this.writeAppMetaFile(project.directory, { name, description })
    await db
      .update(projectApps)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(projectApps.projectId, id))

    this.appService.invalidate(id)
    await this.projectEventsService.publish(id)

    return this.findOne(id, tenantId)
  }

  private async writeAppMetaFile(
    projectDirectory: string,
    meta: { name: string; description: string | null },
  ): Promise<void> {
    const storageMountPath = this.configService.getOrThrow<string>("storageMountPath")
    const appDir = path.join(storageMountPath, projectDirectory, "app")
    const target = path.join(appDir, "app.meta.json")
    const tmp = path.join(appDir, `.app.meta.json.${crypto.randomUUID()}.tmp`)
    const content: { name: string; description?: string } = { name: meta.name }
    if (meta.description !== null) content.description = meta.description
    await writeFile(tmp, JSON.stringify(content, null, 2), "utf8")
    await rename(tmp, target)
  }

  async setAppPin(id: string, tenantId: string, userId: string, isPinned: boolean): Promise<ProjectResponse> {
    const project = await this.findOne(id, tenantId)

    if (isPinned) {
      if (project.authMode !== "public" && project.authMode !== "makara") {
        throw new BadRequestException(
          `AUTH_MODE_NOT_COMPATIBLE: project auth mode must be "public" or "makara" to pin (current: "${project.authMode}"). Change the auth mode in project settings before pinning.`,
        )
      }
      if (!project.hasApp) {
        throw new BadRequestException(
          "APP_NOT_DETECTED: this project has no detectable app yet. Make sure the project's web server is running and serves /api/app-meta before pinning.",
        )
      }
      await db
        .update(projectApps)
        .set({
          isPinned: true,
          pinnedById: userId,
          pinnedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projectApps.projectId, id))
    } else if (project.hasApp) {
      await db
        .update(projectApps)
        .set({
          isPinned: false,
          pinnedById: null,
          pinnedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(projectApps.projectId, id))
    }

    return this.findOne(id, tenantId)
  }

  private async findMakaraTenantName(tenantId: string): Promise<string> {
    const [row] = await db
      .select({
        makaraTenantName: tenantSettings.makaraTenantName,
        tenantName: tenants.name,
      })
      .from(tenants)
      .leftJoin(tenantSettings, eq(tenantSettings.tenantId, tenants.id))
      .where(eq(tenants.id, tenantId))
    if (!row) throw new BadRequestException(`Tenant ${tenantId} not found`)
    return row.makaraTenantName ?? row.tenantName
  }

  async reassignPodById(id: string): Promise<void> {
    const project = await this.findOneById(id)
    await this.requestProjectStartup(project, { deleteExistingPod: true })
  }

  async requestStartupForId(id: string): Promise<void> {
    const project = await this.findOneById(id)
    await this.requestProjectStartup(project, { deleteExistingPod: false })
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

    if (project.status === ProjectStatus.Failed) {
      return { state: "failed", project }
    }

    if (project.status === ProjectStatus.Suspended) {
      return this.wakeSuspendedProject(project)
    }

    if (project.status === ProjectStatus.Starting) {
      return this.handleStartingProject(project)
    }

    this.recordActivity(project.id, activity)

    if (project.podIp) {
      return this.verifyCachedActiveProject(project)
    }

    return this.verifyActiveProject(project)
  }

  async handleProxyFailure(projectId: string, tenantId: string): Promise<boolean> {
    return this.handleProxyFailureForProject(await this.findOne(projectId, tenantId))
  }

  async handleProxyFailureById(projectId: string): Promise<boolean> {
    return this.handleProxyFailureForProject(await this.findOneById(projectId))
  }

  private async handleProxyFailureForProject(project: ProjectResponse): Promise<boolean> {
    if (project.status === ProjectStatus.Disabled) return false
    if (project.status === ProjectStatus.Failed) return false

    if (project.status === ProjectStatus.Starting) {
      this.spawnStartupWorker(project.id)
      return true
    }

    const podName = this.podService.assignedPodName(project.id)
    const pod = await this.readPodOrNull(podName)
    if (!pod || !this.podService.isPodReady(pod)) {
      await this.requestProjectStartup(project, { deleteExistingPod: !!pod })
      return true
    }

    const livePodIp = pod.status?.podIP ?? null
    if (livePodIp && livePodIp !== project.podIp) {
      await db
        .update(projects)
        .set({ podIp: livePodIp, updatedAt: new Date() })
        .where(and(eq(projects.id, project.id), eq(projects.status, ProjectStatus.Active)))
      this.logger.warn(`Repaired stale pod_ip for project ${project.id}: ${project.podIp} -> ${livePodIp}`)
    }

    return false
  }

  private async wakeSuspendedProject(project: ProjectResponse): Promise<EnsureProjectResult> {
    const [updated] = await db
      .update(projects)
      .set({ status: ProjectStatus.Starting, podIp: null, updatedAt: new Date() })
      .where(and(eq(projects.id, project.id), eq(projects.status, ProjectStatus.Suspended)))
      .returning()

    if (updated) {
      await this.projectEventsService.publish(project.id)
    }

    this.spawnStartupWorker(project.id)
    return {
      state: "starting",
      project: { ...project, status: ProjectStatus.Starting, podIp: null },
    }
  }

  private async handleStartingProject(project: ProjectResponse): Promise<EnsureProjectResult> {
    const podName = this.podService.assignedPodName(project.id)
    const pod = await this.readPodOrNull(podName)

    if (!pod) {
      this.spawnStartupWorker(project.id)
      return { state: "starting", project }
    }

    const podIp = pod.status?.podIP ?? null
    if (this.podService.isPodReady(pod) && podIp) {
      await this.markProjectActive(project.id, podIp, podName)
      return {
        state: "ready",
        project: { ...project, status: ProjectStatus.Active, podIp },
      }
    }

    const failure = this.podService.inspectFailureReason(pod)
    if (failure === "ImagePullBackOff") {
      await this.handleStartupFailure(project.id, podName, new PodStartupFailedError(podName, failure))
      return {
        state: "failed",
        project: { ...project, status: ProjectStatus.Failed, podIp: null },
      }
    }

    if (failure === "CrashLoopBackOff") {
      const ageMs = this.podService.podAgeMs(pod)
      if (ageMs > CRASH_LOOP_RECREATE_AGE_MS) {
        this.logger.warn(`Pod ${podName} stuck in CrashLoopBackOff (age=${ageMs}ms); recreating`)
        await this.safeDeletePod(podName, `CrashLoopBackOff recreate for project ${project.id}`)
        this.spawnStartupWorker(project.id)
      }
    }

    return { state: "starting", project }
  }

  private async verifyActiveProject(project: ProjectResponse): Promise<EnsureProjectResult> {
    const podName = this.podService.assignedPodName(project.id)
    const pod = await this.readPodOrNull(podName)
    const podIp = pod?.status?.podIP ?? null

    if (pod && this.podService.isPodReady(pod) && podIp) {
      if (podIp !== project.podIp) {
        await db
          .update(projects)
          .set({ podIp, updatedAt: new Date() })
          .where(and(eq(projects.id, project.id), eq(projects.status, ProjectStatus.Active)))
      }
      return { state: "ready", project: { ...project, podIp } }
    }

    const startingProject = await this.requestProjectStartup(project, { deleteExistingPod: !!pod })
    return { state: "starting", project: startingProject }
  }

  private async verifyCachedActiveProject(project: ProjectResponse): Promise<EnsureProjectResult> {
    const podName = this.podService.assignedPodName(project.id)
    const snapshot = this.podService.getCachedPodSnapshot(podName)
    if (!snapshot.synced) return { state: "ready", project }

    const pod = snapshot.pod
    const podIp = pod?.status?.podIP ?? null
    if (pod && this.podService.isPodReady(pod) && podIp) {
      if (podIp !== project.podIp) {
        await db
          .update(projects)
          .set({ podIp, updatedAt: new Date() })
          .where(and(eq(projects.id, project.id), eq(projects.status, ProjectStatus.Active)))
      }
      return { state: "ready", project: { ...project, podIp } }
    }

    const startingProject = await this.requestProjectStartup(project, { deleteExistingPod: !!pod })
    return { state: "starting", project: startingProject }
  }

  private async markProjectActive(projectId: string, podIp: string, podName: string): Promise<void> {
    const [updated] = await db
      .update(projects)
      .set({
        status: ProjectStatus.Active,
        podIp,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.status, ProjectStatus.Starting)))
      .returning()

    if (!updated) return

    this.startupRetries.delete(projectId)

    await Promise.allSettled([
      this.timeoutService.touch(projectId).catch((err) => {
        this.logger.warn(`Failed to touch timeout for project ${projectId}: ${(err as Error).message}`)
      }),
      db
        .update(projectDuplicateJobs)
        .set({ status: ProjectDuplicateStatus.Completed, updatedAt: new Date() })
        .where(
          and(
            eq(projectDuplicateJobs.targetProjectId, projectId),
            eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting),
          ),
        ),
      this.projectEventsService.publish(projectId).catch((err) => {
        this.logger.warn(`Failed to publish project active event for ${projectId}: ${(err as Error).message}`)
      }),
    ])
    this.logger.log(`Project ${projectId} active on pod ${podName} (${podIp})`)
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
        this.spawnStartupWorker(job.targetProjectId)
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
      if (options.deleteExistingPod) {
        const podName = this.podService.assignedPodName(project.id)
        this.recreateRequests.add(project.id)
        await this.safeDeletePod(podName, `restart for project ${project.id}`)
      }
      this.spawnStartupWorker(project.id)
      return project
    }

    const [updated] = await db
      .update(projects)
      .set({
        status: ProjectStatus.Starting,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.id, project.id),
          inArray(projects.status, [ProjectStatus.Active, ProjectStatus.Suspended, ProjectStatus.Failed]),
        ),
      )
      .returning()

    if (!updated) {
      const current = await this.findOneById(project.id)
      if (current.status === ProjectStatus.Starting) {
        this.spawnStartupWorker(current.id)
      }
      return current
    }

    if (options.deleteExistingPod) {
      const podName = this.podService.assignedPodName(project.id)
      this.recreateRequests.add(project.id)
      await this.safeDeletePod(podName, `restart for project ${project.id}`)
    }

    this.spawnStartupWorker(project.id)
    this.appService.invalidate(project.id)
    await this.projectEventsService.publish(project.id)

    return this.findOneById(project.id)
  }

  private spawnStartupWorker(projectId: string): void {
    if (this.startupTasks.has(projectId)) return
    const task = this.runStartup(projectId)
      .catch((err) => {
        this.logger.warn(`Startup worker for project ${projectId} crashed: ${(err as Error).message}`)
      })
      .finally(() => {
        this.startupTasks.delete(projectId)
      })
    this.startupTasks.set(projectId, task)
  }

  private async runStartup(projectId: string): Promise<void> {
    if (await this.hasBlockingDuplicateOperation(projectId)) return

    const current = await this.findOneById(projectId).catch(() => null)
    if (!current || current.status !== ProjectStatus.Starting) return

    const podName = this.podService.assignedPodName(projectId)
    const recreateRequested = this.recreateRequests.delete(projectId)
    const existingPod = await this.readPodOrNull(podName)
    if (existingPod && !existingPod.metadata?.deletionTimestamp) {
      if (recreateRequested) {
        try {
          await this.podService.deletePod(podName)
        } catch (err) {
          await this.handleStartupFailure(projectId, podName, err)
          return
        }
      } else {
        const existingPodIp = existingPod.status?.podIP ?? null
        if (this.podService.isPodReady(existingPod) && existingPodIp) {
          await this.markProjectActive(projectId, existingPodIp, podName)
          return
        }

        const failure = this.podService.inspectFailureReason(existingPod)
        if (failure === "ImagePullBackOff") {
          await this.handleStartupFailure(projectId, podName, new PodStartupFailedError(podName, failure))
          return
        }

        if (failure !== "CrashLoopBackOff" || this.podService.podAgeMs(existingPod) <= CRASH_LOOP_RECREATE_AGE_MS) {
          try {
            const podIp = await this.podService.waitForReady(podName)
            await this.markProjectActive(projectId, podIp, podName)
          } catch (err) {
            await this.handleStartupFailure(projectId, podName, err)
          }
          return
        }

        await this.safeDeletePod(podName, `CrashLoopBackOff recreate for project ${projectId}`)
      }
    }

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

    try {
      const assignedPod = await this.podService.createAssignedPod(projectId, current.directory, tenantOptions)
      if (assignedPod.created) {
        await this.podPoolService.claimWarmPod().catch((err) => {
          this.logger.warn(`Failed to claim warm pod for project ${projectId}: ${(err as Error).message}`)
        })
      }
      const podIp = await this.podService.waitForReady(podName)
      await this.markProjectActive(projectId, podIp, podName)
    } catch (err) {
      await this.handleStartupFailure(projectId, podName, err)
    }
  }

  private async handleStartupFailure(projectId: string, podName: string, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : "Project pod failed to start"
    const isPermanentImageFailure = err instanceof PodStartupFailedError && err.reason === "ImagePullBackOff"

    this.logger.warn(`Startup failed for project ${projectId}: ${message}`)

    this.appService.invalidate(projectId)

    const duplicateFailUpdate = isPermanentImageFailure
      ? db
          .update(projectDuplicateJobs)
          .set({ status: ProjectDuplicateStatus.Failed, error: message, updatedAt: new Date() })
          .where(
            and(
              eq(projectDuplicateJobs.targetProjectId, projectId),
              eq(projectDuplicateJobs.status, ProjectDuplicateStatus.Starting),
            ),
          )
      : Promise.resolve()

    await Promise.allSettled([
      isPermanentImageFailure
        ? Promise.resolve()
        : this.safeDeletePod(podName, `startup failure for project ${projectId}`),
      duplicateFailUpdate,
      this.projectEventsService.publish(projectId).catch((publishErr) => {
        this.logger.warn(
          `Failed to publish startup failure event for ${projectId}: ${(publishErr as Error).message}`,
        )
      }),
    ])

    if (isPermanentImageFailure) {
      this.startupRetries.delete(projectId)
      await db
        .update(projects)
        .set({ status: ProjectStatus.Failed, podIp: null, updatedAt: new Date() })
        .where(and(eq(projects.id, projectId), eq(projects.status, ProjectStatus.Starting)))
      await this.projectEventsService.publish(projectId).catch(() => {})
      return
    }

    const attempts = (this.startupRetries.get(projectId) ?? 0) + 1
    this.startupRetries.set(projectId, attempts)
    const delay = Math.min(STARTUP_RETRY_BASE_MS * Math.pow(2, attempts - 1), STARTUP_RETRY_MAX_MS)
    this.logger.warn(`Scheduling retry ${attempts} for project ${projectId} in ${delay}ms`)
    setTimeout(() => {
      this.spawnStartupWorker(projectId)
    }, delay)
  }

  private async safeDeletePod(podName: string, context: string): Promise<void> {
    await this.podService.deletePod(podName).catch((err) => {
      this.logger.warn(`Failed to delete pod ${podName} (${context}): ${(err as Error).message}`)
    })
  }

  private async readPodOrNull(podName: string) {
    try {
      return await this.podService.getPod(podName)
    } catch (err) {
      if (this.podService.isNotFound(err)) return null
      throw err
    }
  }

  private recordActivity(projectId: string, activity: ProjectActivityKind) {
    const touch = activity === "agent" ? this.touchActivity(projectId) : this.touchAppActivity(projectId)

    void touch.catch((err) => {
      this.logger.warn(`Failed to touch ${activity} activity for project ${projectId}: ${err.message}`)
    })
  }
}

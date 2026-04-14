import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
  OnApplicationBootstrap,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq, and, desc, asc, inArray, or, ne, sql } from "drizzle-orm"
import crypto from "crypto"
import { db, pgClient } from "../../db"
import { projectSettings, projects, pods, tenants, deletedProjects } from "../../db/schema"
import { PodService, TenantPodOptions } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"
import { TimeoutService } from "../timeout/timeout.service"
import { BifrostService } from "../bifrost/bifrost.service"
import {
  CreateProjectDto,
  UpdateProjectDto,
  DuplicateProjectDto,
  ProjectResponse,
  ProjectStatus,
} from "./project.types"

type ProjectActivityKind = "agent" | "app"

export interface EnsureProjectResult {
  state: "ready" | "starting" | "disabled"
  project: ProjectResponse
}

const projectSelectFields = {
  id: projects.id,
  tenantId: projects.tenantId,
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
  lastActiveAt: projects.lastActiveAt,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
}

@Injectable()
export class ProjectService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProjectService.name)
  private readonly startupTasks = new Map<string, Promise<void>>()
  private readonly pendingSourceDirs = new Map<string, string>()

  constructor(
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
    private readonly timeoutService: TimeoutService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BifrostService))
    private readonly bifrostService: BifrostService,
  ) {}

  async onApplicationBootstrap() {
    await this.reconcileProjects().catch((err) => {
      this.logger.warn(`Failed to reconcile projects on startup: ${err.message}`)
    })
  }

  async create(dto: CreateProjectDto | undefined, tenantId: string): Promise<ProjectResponse> {
    const id = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
    const podName = this.podService.assignedPodName(id)
    const timeoutIdle = this.configService.get<number>("defaultTimeoutIdle", 30 * 60 * 1000)
    const appTimeoutIdle = this.configService.get<number>("defaultAppTimeoutIdle", 7 * 24 * 60 * 60 * 1000)

    await db.transaction(async (tx) => {
      await tx
        .insert(projects)
        .values({
          id,
          tenantId,
          title: dto?.title ?? null,
          description: dto?.description ?? null,
          directory,
          status: ProjectStatus.Starting,
          podName,
          podIp: null,
          platformVersion,
        })

      await tx
        .insert(projectSettings)
        .values({
          projectId: id,
          timeoutIdle,
          appTimeoutIdle,
        })
    })

    this.queueProjectStartup(id)

    return this.findOne(id, tenantId)
  }

  async duplicate(sourceId: string, tenantId: string, dto?: DuplicateProjectDto): Promise<ProjectResponse> {
    const source = await this.findOne(sourceId, tenantId)

    const id = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")
    const podName = this.podService.assignedPodName(id)
    const title = dto?.title ?? (source.title ? `${source.title} (copy)` : null)

    await db.transaction(async (tx) => {
      await tx
        .insert(projects)
        .values({
          id,
          tenantId,
          title,
          description: source.description,
          directory,
          status: ProjectStatus.Starting,
          podName,
          podIp: null,
          platformVersion,
        })

      await tx
        .insert(projectSettings)
        .values({
          projectId: id,
          timeoutIdle: source.timeoutIdle,
          appTimeoutIdle: source.appTimeoutIdle,
        })
    })

    this.pendingSourceDirs.set(id, source.directory)
    this.queueProjectStartup(id)

    return this.findOne(id, tenantId)
  }

  async ensureProjectForTenant(
    projectId: string,
    tenantId: string,
    activity: ProjectActivityKind,
  ): Promise<EnsureProjectResult> {
    const project = await this.findOne(projectId, tenantId)
    return this.ensureProjectAccess(project, activity)
  }

  async ensureProjectById(
    projectId: string,
    activity: ProjectActivityKind,
  ): Promise<EnsureProjectResult> {
    const project = await this.findOneById(projectId)
    return this.ensureProjectAccess(project, activity)
  }

  async findAll(tenantId: string): Promise<ProjectResponse[]> {
    return db
      .select(projectSelectFields)
      .from(projects)
      .innerJoin(projectSettings, eq(projectSettings.projectId, projects.id))
      .where(eq(projects.tenantId, tenantId))
      .orderBy(
        asc(sql`CASE WHEN ${projects.status} = 'disabled' THEN 1 ELSE 0 END`),
        desc(projects.lastActiveAt),
        desc(projects.createdAt),
      )
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
    if (dto.timeoutIdle !== undefined) settingsUpdates.timeoutIdle = this.normalizeTimeoutIdle(dto.timeoutIdle, "timeoutIdle")
    if (dto.appTimeoutIdle !== undefined) settingsUpdates.appTimeoutIdle = this.normalizeTimeoutIdle(dto.appTimeoutIdle, "appTimeoutIdle")

    await db.transaction(async (tx) => {
      if (Object.keys(projectUpdates).length > 0 || Object.keys(settingsUpdates).length > 0) {
        await tx
          .update(projects)
          .set({ ...projectUpdates, updatedAt: now })
          .where(eq(projects.id, project.id))
      }

      if (Object.keys(settingsUpdates).length > 0) {
        await tx
          .update(projectSettings)
          .set(settingsUpdates)
          .where(eq(projectSettings.projectId, project.id))
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

    await this.timeoutService.clear(id)
    await db.delete(projects).where(eq(projects.id, id))
    this.startupTasks.delete(id)
    await this.podPoolService.replenish().catch((err) => {
      this.logger.warn(`Failed to replenish warm pool after deleting project ${id}: ${err.message}`)
    })
    await db.insert(deletedProjects).values({
      id: project.id,
      tenantId: project.tenantId,
      directory: project.directory,
    }).onConflictDoNothing()
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
    return this.findOne(id, tenantId)
  }

  async reassignPod(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId)
    await this.requestProjectStartup(project, { deleteExistingPod: true })
  }

  async reassignPodById(id: string): Promise<void> {
    const project = await this.findOneById(id)
    await this.requestProjectStartup(project, { deleteExistingPod: true })
  }

  async touchActivity(projectId: string): Promise<void> {
    await this.timeoutService.touch(projectId)
    await db
      .update(projects)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  }

  async touchAppActivity(projectId: string): Promise<void> {
    await this.timeoutService.touchApp(projectId)
    await db
      .update(projects)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  }

  private async ensureProjectAccess(
    project: ProjectResponse,
    activity: ProjectActivityKind,
  ): Promise<EnsureProjectResult> {
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
            db
              .update(projects)
              .set({ podIp, updatedAt: new Date() })
              .where(eq(projects.id, project.id)),
          ])
          return { state: "ready", project: { ...project, podIp } }
        }
      }

      const startingProject = await this.requestProjectStartup(project, {
        deleteExistingPod: !!pod,
      })
      return { state: "starting", project: startingProject }
    }

    const startingProject = await this.requestProjectStartup(project, { deleteExistingPod: false })
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

  private async buildTenantPodOptions(projectId: string, tenantId: string): Promise<TenantPodOptions | undefined> {
    if (!this.bifrostService.isEnabled()) return undefined

    try {
      const [[tenant], [project]] = await Promise.all([
        db.select().from(tenants).where(eq(tenants.id, tenantId)),
        db.select().from(projects).where(eq(projects.id, projectId)),
      ])
      const customerId = tenant?.bifrostTenantId

      let teamId = project?.bifrostProjectId ?? undefined
      if (!teamId && customerId) {
        teamId = await this.bifrostService.createProjectTeam(projectId, customerId)
      }

      const [chatKey, backendKey] = await Promise.all([
        this.bifrostService.createProjectKey(projectId, tenantId, "chat", teamId),
        this.bifrostService.createProjectKey(projectId, tenantId, "backend", teamId),
      ])

      return {
        bifrostApiKey: chatKey.keyToken,
        bifrostBackendApiKey: backendKey.keyToken,
        bifrostProxyUrl: this.bifrostService.getPodProxyUrl(),
      }
    } catch (err) {
      this.logger.warn(`Failed to create Bifrost keys for project ${projectId}: ${(err as Error).message}`)
      return undefined
    }
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
      .where(and(
        eq(projects.id, project.id),
        inArray(projects.status, [
          ProjectStatus.Active,
          ProjectStatus.Suspended,
        ]),
      ))
      .returning()

    if (!updated) {
      const current = await this.findOneById(project.id)
      if (current.status === ProjectStatus.Starting) {
        this.queueProjectStartup(current.id)
      }
      return current
    }

    if (options.deleteExistingPod) {
      const podNames = Array.from(new Set(
        [project.podName, podName].filter((name): name is string => !!name),
      ))
      await Promise.all(podNames.map((name) => this.podService.deletePod(name).catch(() => {})))
    }

    await this.deleteProjectPods(project.id, podName)
    this.queueProjectStartup(project.id)

    return this.findOneById(project.id)
  }

  private queueProjectStartup(projectId: string) {
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
      const current = await this.findOneById(projectId).catch(() => null)
      if (!current || current.status !== ProjectStatus.Starting) return

      const tenantOptions = await this.buildTenantPodOptions(projectId, current.tenantId)
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
        const sourceDir = this.pendingSourceDirs.get(projectId)
        this.pendingSourceDirs.delete(projectId)
        await this.podService.createAssignedPod(projectId, current.directory, tenantOptions, sourceDir)
        await this.ensureAssignedPodRow(projectId, podName, null)

        const podIp = await this.podService.waitForReady(podName)
        await this.setProjectActive(projectId, podName, podIp)
      } catch (err) {
        await this.handleStartupFailure(projectId, podName)
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
    this.logger.log(`Project ${projectId} active on pod ${podName} (${podIp})`)
  }

  private async handleStartupFailure(projectId: string, podName: string): Promise<void> {
    await this.podService.deletePod(podName).catch(() => {})
    await this.deleteProjectPods(projectId, podName)

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))

    if (!project) return

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Suspended,
        podName: null,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
  }

  private async ensureAssignedPodRow(projectId: string, podName: string, podIp: string | null): Promise<void> {
    await db
      .delete(pods)
      .where(and(eq(pods.projectId, projectId), ne(pods.podName, podName)))

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
      await db
        .delete(pods)
        .where(or(eq(pods.projectId, projectId), eq(pods.podName, podName)))
      return
    }

    await db.delete(pods).where(eq(pods.projectId, projectId))
  }

  private recordActivity(projectId: string, activity: ProjectActivityKind) {
    const touch = activity === "agent"
      ? this.touchActivity(projectId)
      : this.touchAppActivity(projectId)

    void touch.catch((err) => {
      this.logger.warn(`Failed to touch ${activity} activity for project ${projectId}: ${err.message}`)
    })
  }

  private normalizeTimeoutIdle(value: number, field: "timeoutIdle" | "appTimeoutIdle"): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive millisecond value`)
    }

    return Math.round(value)
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
          .unsafe(
            "select pg_advisory_unlock(hashtext($1), hashtext($2))",
            ["opsiforce-project-startup", projectId],
          )
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
      .where(inArray(projects.status, [
        ProjectStatus.Starting,
        ProjectStatus.Active,
      ]))

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
      await db
        .update(projects)
        .set({ podIp, updatedAt: new Date() })
        .where(eq(projects.id, project.id))
    }
  }
}

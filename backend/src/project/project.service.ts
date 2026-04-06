import { Injectable, NotFoundException, Logger, Inject, forwardRef } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq, and, desc } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { projects, pods } from "../../db/schema"
import { PodService, TenantPodOptions } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"
import { TimeoutService } from "../timeout/timeout.service"
import { BifrostService } from "../bifrost/bifrost.service"
import { CreateProjectDto, UpdateProjectDto, ProjectResponse, ProjectStatus } from "./project.types"
import type { DynamicSkill } from "../pod/pod.template"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const DYNAMIC_SKILLS_DIR = join(process.cwd(), "dynamic-skills")

function loadSkill(name: string): string {
  const path = join(DYNAMIC_SKILLS_DIR, `${name}.md`)
  if (!existsSync(path)) return ""
  return readFileSync(path, "utf-8")
}

const AI_API_SKILL_CONTENT = loadSkill("ai-api")

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name)

  constructor(
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
    private readonly timeoutService: TimeoutService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => BifrostService))
    private readonly bifrostService: BifrostService,
  ) {}

  async create(dto: CreateProjectDto | undefined, tenantId: string): Promise<ProjectResponse> {
    const id = crypto.randomUUID()
    const directory = `projects/${tenantId}/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")

    const [project] = await db
      .insert(projects)
      .values({
        id,
        tenantId,
        title: dto?.title ?? null,
        description: dto?.description ?? null,
        directory,
        status: ProjectStatus.Pending,
        platformVersion,
      })
      .returning()

    this.assignPod(id, directory).catch((err) => {
      this.logger.warn(`Failed to assign pod to project ${id}: ${err.message}`)
    })

    return project
  }

  private async buildTenantPodOptions(projectId: string, tenantId: string): Promise<TenantPodOptions | undefined> {
    if (!this.bifrostService.isEnabled()) return undefined

    try {
      const { keyToken } = await this.bifrostService.createProjectKey(projectId, tenantId)
      const dynamicSkills: DynamicSkill[] = AI_API_SKILL_CONTENT
        ? [{ name: "ai-api", content: AI_API_SKILL_CONTENT }]
        : []

      return {
        bifrostApiKey: keyToken,
        bifrostProxyUrl: this.bifrostService.getPodProxyUrl(),
        dynamicSkills,
      }
    } catch (err) {
      this.logger.warn(`Failed to create Bifrost key for project ${projectId}: ${(err as Error).message}`)
      return undefined
    }
  }

  private async assignPod(projectId: string, directory: string): Promise<void> {
    try {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId))
      const tenantOptions = await this.buildTenantPodOptions(projectId, project.tenantId)

      const claimedPod = await this.podPoolService.claimWarmPod()

      if (!claimedPod) {
        this.logger.warn(`No warm pods available for project ${projectId}, creating directly`)
        const pod = await this.podService.createAssignedPod(projectId, directory, tenantOptions)
        await this.waitForPodReady(pod.podName, projectId)
        return
      }

      const assigned = await this.podService.assignPodToProject(claimedPod.podName, projectId, directory, tenantOptions)
      const podIp = await this.waitForPodReady(assigned.podName, projectId)

      await db
        .update(pods)
        .set({ podName: assigned.podName, projectId, podIp, updatedAt: new Date() })
        .where(eq(pods.id, claimedPod.id))
    } catch (err) {
      await db
        .update(projects)
        .set({ status: ProjectStatus.Suspended, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
      throw err
    }
  }

  private async waitForPodReady(podName: string, projectId: string): Promise<string> {
    const podIp = await this.podService.waitForReady(podName)

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Active,
        podName,
        podIp,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    await this.timeoutService.touch(projectId)
    this.logger.log(`Project ${projectId} active on pod ${podName} (${podIp})`)
    return podIp
  }

  async findAll(tenantId: string): Promise<ProjectResponse[]> {
    return db
      .select()
      .from(projects)
      .where(eq(projects.tenantId, tenantId))
      .orderBy(desc(projects.lastActiveAt), desc(projects.createdAt))
  }

  async findOne(id: string, tenantId: string): Promise<ProjectResponse> {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  async update(id: string, dto: UpdateProjectDto, tenantId: string): Promise<ProjectResponse> {
    const [project] = await db
      .update(projects)
      .set({ ...dto, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
      .returning()

    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId)

    if (project.podName) {
      await db
        .update(pods)
        .set({ status: "terminating", updatedAt: new Date() })
        .where(eq(pods.podName, project.podName))

      await this.podService.deletePod(project.podName).catch(() => {})

      await db.delete(pods).where(eq(pods.podName, project.podName))
    }

    if (this.bifrostService.isEnabled()) {
      await this.bifrostService.revokeProjectKey(id).catch((err) => {
        this.logger.warn(`Failed to revoke Bifrost key for project ${id}: ${(err as Error).message}`)
      })
    }

    await this.timeoutService.clear(id)
    await db.delete(projects).where(eq(projects.id, id))
  }

  async reassignPod(id: string, tenantId: string): Promise<void> {
    const project = await this.findOne(id, tenantId)
    if (project.status === ProjectStatus.Pending) return

    if (project.podName) {
      await db
        .update(pods)
        .set({ status: "terminating", updatedAt: new Date() })
        .where(eq(pods.podName, project.podName))

      await this.podService.deletePod(project.podName).catch(() => {})

      await db.delete(pods).where(eq(pods.podName, project.podName))
    }

    await this.timeoutService.clear(id)

    await db
      .update(projects)
      .set({
        status: ProjectStatus.Pending,
        podName: null,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))

    this.assignPod(id, project.directory).catch((err) => {
      this.logger.warn(`Failed to reassign pod to project ${id}: ${err.message}`)
    })
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
}

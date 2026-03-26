import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { projects, pods } from "../../db/schema"
import { PodService } from "../pod/pod.service"
import { PodPoolService } from "../pod/pod.pool.service"
import { TimeoutService } from "../timeout/timeout.service"
import { CreateProjectDto, UpdateProjectDto, ProjectResponse } from "./project.types"

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name)

  constructor(
    private readonly podService: PodService,
    private readonly podPoolService: PodPoolService,
    private readonly timeoutService: TimeoutService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto?: CreateProjectDto): Promise<ProjectResponse> {
    const id = crypto.randomUUID()
    const directory = `projects/${id}`
    const platformVersion = this.configService.get<string>("platformVersion", "0.1.0")

    const [project] = await db
      .insert(projects)
      .values({
        id,
        title: dto?.title ?? null,
        description: dto?.description ?? null,
        directory,
        status: "pending",
        platformVersion,
      })
      .returning()

    this.assignPod(id, directory).catch((err) => {
      this.logger.warn(`Failed to assign pod to project ${id}: ${err.message}`)
    })

    return project
  }

  private async assignPod(projectId: string, directory: string): Promise<void> {
    try {
      const claimedPod = await this.podPoolService.claimWarmPod()

      if (!claimedPod) {
        this.logger.warn(`No warm pods available for project ${projectId}, creating directly`)
        const pod = await this.podService.createAssignedPod(projectId, directory)
        await this.waitForPodReady(pod.podName, projectId)
        return
      }

      const assigned = await this.podService.assignPodToProject(claimedPod.podName, projectId, directory)
      await this.waitForPodReady(assigned.podName, projectId)
    } catch (err) {
      await db
        .update(projects)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(projects.id, projectId))
      throw err
    }
  }

  private async waitForPodReady(podName: string, projectId: string): Promise<void> {
    const podIp = await this.podService.waitForReady(podName)

    await db
      .update(projects)
      .set({
        status: "active",
        podName,
        podIp,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))

    await this.timeoutService.touch(projectId)
    this.logger.log(`Project ${projectId} active on pod ${podName} (${podIp})`)
  }

  async findAll(): Promise<ProjectResponse[]> {
    return db.select().from(projects)
  }

  async findOne(id: string): Promise<ProjectResponse> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id))
    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectResponse> {
    const [project] = await db
      .update(projects)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning()

    if (!project) throw new NotFoundException(`Project ${id} not found`)
    return project
  }

  async remove(id: string): Promise<void> {
    const project = await this.findOne(id)

    if (project.status === "active" || project.status === "starting") {
      await this.stop(id)
    }

    await db.delete(projects).where(eq(projects.id, id))
  }

  async resume(id: string): Promise<ProjectResponse> {
    const project = await this.findOne(id)

    if (project.status === "active" || project.status === "starting") {
      throw new BadRequestException(`Project ${id} is already ${project.status}`)
    }

    const claimedPod = await this.podPoolService.claimWarmPod()

    let podName: string

    if (claimedPod) {
      const assigned = await this.podService.assignPodToProject(claimedPod.podName, id, project.directory)
      podName = assigned.podName
    } else {
      this.logger.warn(`No warm pods available for resume ${id}, creating directly`)
      const assigned = await this.podService.createAssignedPod(id, project.directory)
      podName = assigned.podName
    }

    const podIp = await this.podService.waitForReady(podName)

    const [updated] = await db
      .update(projects)
      .set({
        status: "active",
        podName,
        podIp,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning()

    if (claimedPod) {
      await db
        .update(pods)
        .set({ projectId: id, podName, podIp, updatedAt: new Date() })
        .where(eq(pods.id, claimedPod.id))
    }

    await this.timeoutService.touch(id)

    return updated
  }

  async stop(id: string): Promise<ProjectResponse> {
    const project = await this.findOne(id)

    if (project.podName) {
      await db
        .update(pods)
        .set({ status: "terminating", updatedAt: new Date() })
        .where(eq(pods.podName, project.podName))

      await this.podService.deletePod(project.podName).catch(() => {})

      await db.delete(pods).where(eq(pods.podName, project.podName))
    }

    await this.timeoutService.clear(id)

    const [updated] = await db
      .update(projects)
      .set({
        status: "stopped",
        podName: null,
        podIp: null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning()

    return updated
  }

  async touchActivity(projectId: string): Promise<void> {
    await this.timeoutService.touch(projectId)
    await db
      .update(projects)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId))
  }
}

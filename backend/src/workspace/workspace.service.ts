import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import {
  projects,
  users,
  userWorkspacePreferences,
  workspaceMembers,
  workspaces,
} from "../../db/schema"
import { Perms } from "../permission/permission.constants"
import { ProjectService } from "../project/project.service"
import type { CreateProjectDto, ProjectResponse } from "../project/project.types"
import type { UserRecord } from "../user/user.service"
import type {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponse,
} from "./workspace.types"

const workspaceBaseFields = {
  id: workspaces.id,
  tenantId: workspaces.tenantId,
  type: workspaces.type,
  ownerId: workspaces.ownerId,
  name: workspaces.name,
  description: workspaces.description,
  createdAt: workspaces.createdAt,
  updatedAt: workspaces.updatedAt,
}

type WorkspaceBaseRow = typeof workspaces.$inferSelect

const PRIVATE_WORKSPACE_NAME = "Personal"

@Injectable()
export class WorkspaceService {
  constructor(private readonly projectService: ProjectService) {}

  /**
   * Returns workspaces the user is a member of (sidebar view). No admin
   * bypass — admins only see workspaces they joined. Sorted by
   * user_workspace_preferences.workspaceOrder; missing ids fall back to
   * createdAt ASC. Stale ids (deleted workspaces) are filtered at read time.
   */
  async findAll(params: { userId: string; tenantId: string }): Promise<WorkspaceResponse[]> {
    const { userId, tenantId } = params

    const [rows, pref] = await Promise.all([
      db
        .select(workspaceBaseFields)
        .from(workspaces)
        .innerJoin(
          workspaceMembers,
          and(
            eq(workspaceMembers.workspaceId, workspaces.id),
            eq(workspaceMembers.userId, userId),
          ),
        )
        .where(eq(workspaces.tenantId, tenantId))
        .orderBy(asc(workspaces.createdAt)),
      db
        .select({ order: userWorkspacePreferences.workspaceOrder })
        .from(userWorkspacePreferences)
        .where(eq(userWorkspacePreferences.userId, userId))
        .then((r) => r[0]?.order ?? []),
    ])

    return applyUserOrder(await this.attachCounts(rows), pref)
  }

  /**
   * Returns every shared workspace in the tenant plus the admin's own private
   * workspace — for the admin-overview settings page. Caller must have
   * can_manage_workspaces (enforced at controller). Other users' private
   * workspaces are intentionally invisible to admins.
   */
  async findAllForAdmin(tenantId: string, adminUserId: string): Promise<WorkspaceResponse[]> {
    const rows = await db
      .select(workspaceBaseFields)
      .from(workspaces)
      .where(
        and(
          eq(workspaces.tenantId, tenantId),
          or(eq(workspaces.type, "shared"), eq(workspaces.ownerId, adminUserId)),
        ),
      )
      .orderBy(asc(workspaces.createdAt))
    return this.attachCounts(rows)
  }

  async findOne(params: {
    workspaceId: string
    userId: string
    tenantId: string
    canManageWorkspaces: boolean
  }): Promise<WorkspaceResponse> {
    const { workspaceId, userId, tenantId, canManageWorkspaces } = params
    const base = await this.findOneBase(workspaceId, tenantId)
    // Admin bypass applies only to shared workspaces. Private workspaces are
    // visible exclusively to their owner; admins do not get a back door.
    const adminBypass = canManageWorkspaces && base.type === "shared"
    if (!adminBypass && !(await this.isMember(workspaceId, userId))) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`)
    }
    const [withCounts] = await this.attachCounts([base])
    return withCounts
  }

  private async findOneBase(workspaceId: string, tenantId: string): Promise<WorkspaceBaseRow> {
    const [row] = await db
      .select(workspaceBaseFields)
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
    if (!row) throw new NotFoundException(`Workspace ${workspaceId} not found`)
    return row
  }

  async create(
    dto: CreateWorkspaceDto,
    tenantId: string,
    creatorUserId: string,
  ): Promise<WorkspaceResponse> {
    const name = dto.name?.trim()
    if (!name) throw new BadRequestException("name is required")

    const id = crypto.randomUUID()
    const now = new Date()

    // Insert workspace + auto-add creator as member so it shows in their sidebar.
    await db.transaction(async (tx) => {
      await tx.insert(workspaces).values({
        id,
        tenantId,
        type: "shared",
        name,
        description: dto.description ?? null,
      })
      await tx.insert(workspaceMembers).values({ workspaceId: id, userId: creatorUserId })
    })

    return {
      id,
      tenantId,
      type: "shared",
      ownerId: null,
      name,
      description: dto.description ?? null,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
      projectCount: 0,
    }
  }

  /**
   * Idempotent provisioning of a user's private workspace in a tenant.
   * Called on every `getOrCreateUser` so the invariant "every (user, tenant)
   * has exactly one private workspace" self-heals. The partial unique index
   * on (tenant_id, owner_id) WHERE owner_id IS NOT NULL guarantees at most
   * one row will ever exist for the pair, even under concurrent requests.
   */
  async ensurePrivateWorkspace(userId: string, tenantId: string): Promise<void> {
    const id = crypto.randomUUID()

    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(workspaces)
        .values({
          id,
          tenantId,
          type: "private",
          ownerId: userId,
          name: PRIVATE_WORKSPACE_NAME,
        })
        .onConflictDoNothing({
          target: [workspaces.tenantId, workspaces.ownerId],
          where: sql`${workspaces.ownerId} is not null`,
        })
        .returning({ id: workspaces.id })

      if (inserted.length === 0) return

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: inserted[0].id, userId })
        .onConflictDoNothing()
    })
  }

  /**
   * Private workspaces are not mutable through the workspace API — they
   * cannot be renamed, deleted, or have members added/removed. The owner
   * relationship is fixed at creation; cleanup happens via user-level
   * CASCADE deletes. UI hides these controls; this guard is the server-side
   * backstop.
   */
  private assertMutable(workspace: WorkspaceBaseRow): void {
    if (workspace.type === "private") {
      throw new BadRequestException("Private workspace cannot be modified")
    }
  }

  async update(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    tenantId: string,
  ): Promise<WorkspaceResponse> {
    const base = await this.findOneBase(workspaceId, tenantId)
    this.assertMutable(base)

    const updates: Partial<typeof workspaces.$inferInsert> = {}
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) throw new BadRequestException("name cannot be empty")
      updates.name = name
    }
    if (dto.description !== undefined) updates.description = dto.description

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()

      await db
        .update(workspaces)
        .set(updates)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
    }

    const refreshed = await this.findOneBase(workspaceId, tenantId)
    const [withCounts] = await this.attachCounts([refreshed])
    return withCounts
  }

  async remove(workspaceId: string, tenantId: string): Promise<void> {
    const base = await this.findOneBase(workspaceId, tenantId)
    this.assertMutable(base)

    await db
      .delete(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
  }

  async listMembers(params: {
    workspaceId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
  }): Promise<UserRecord[]> {
    await this.findOne(params)
    return db
      .select()
      .from(users)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, params.workspaceId))
      .orderBy(users.displayName)
      .then((rows) => rows.map((r) => r.users))
  }

  async addMember(workspaceId: string, userId: string, tenantId: string): Promise<void> {
    const [base, [u]] = await Promise.all([
      this.findOneBase(workspaceId, tenantId),
      db.select({ id: users.id }).from(users).where(eq(users.id, userId)),
    ])
    this.assertMutable(base)
    if (!u) throw new NotFoundException(`User ${userId} not found`)

    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId })
      .onConflictDoNothing()
  }

  async removeMember(workspaceId: string, userId: string, tenantId: string): Promise<void> {
    const base = await this.findOneBase(workspaceId, tenantId)
    this.assertMutable(base)

    await db
      .delete(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const rows = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
      )
    return rows.length > 0
  }

  async listProjects(params: {
    workspaceId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
  }): Promise<ProjectResponse[]> {
    await this.findOne(params)
    return this.projectService.findAllInWorkspace(params.tenantId, params.workspaceId)
  }

  async assignProject(params: {
    workspaceId: string | null
    projectId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
    canMoveProjectsBetweenWorkspaces: boolean
  }): Promise<ProjectResponse> {
    const {
      workspaceId,
      projectId,
      tenantId,
      userId,
      canManageWorkspaces,
      canMoveProjectsBetweenWorkspaces,
    } = params

    if (workspaceId === null && !canManageWorkspaces) {
      throw new ForbiddenException(`Missing permission: ${Perms.manageWorkspaces}`)
    }

    const project = canManageWorkspaces
      ? await this.projectService.findOne(projectId, tenantId)
      : await this.projectService.findOneForUser({ projectId, tenantId, userId })

    if (workspaceId !== null) {
      const target = await this.findOneBase(workspaceId, tenantId)

      if (target.type === "private" && project.workspaceId !== workspaceId) {
        throw new ForbiddenException("Public and workspace projects can't be made private")
      }

      const sourceOwnedByCaller = await this.isOwnedByUser(project.workspaceId, userId)
      const targetOwnedByCaller = target.ownerId === userId

      const movePermWaived = sourceOwnedByCaller || targetOwnedByCaller

      if (!canManageWorkspaces && !movePermWaived && !canMoveProjectsBetweenWorkspaces) {
        throw new ForbiddenException(
          `Missing permission: ${Perms.moveProjectsBetweenWorkspaces}`,
        )
      }

      const targetVisible = targetOwnedByCaller || (canManageWorkspaces && target.type === "shared")
      if (!targetVisible && !(await this.isMember(workspaceId, userId))) {
        throw new NotFoundException(`Workspace ${workspaceId} not found`)
      }
    }

    const now = new Date()
    await db
      .update(projects)
      .set({ workspaceId, updatedAt: now })
      .where(and(eq(projects.id, project.id), eq(projects.tenantId, tenantId)))

    return { ...project, workspaceId, updatedAt: now }
  }

  private async isOwnedByUser(workspaceId: string | null, userId: string): Promise<boolean> {
    if (!workspaceId) return false
    const [row] = await db
      .select({ ownerId: workspaces.ownerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
    return row?.ownerId === userId
  }

  async createProjectInWorkspace(params: {
    workspaceId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
    dto?: CreateProjectDto
  }): Promise<ProjectResponse> {
    const { workspaceId, tenantId, userId, canManageWorkspaces, dto } = params

    await this.findOne({ workspaceId, userId, tenantId, canManageWorkspaces })

    return this.projectService.create(dto, tenantId, workspaceId)
  }

  private async attachCounts(rows: WorkspaceBaseRow[]): Promise<WorkspaceResponse[]> {
    if (rows.length === 0) return []
    const ids = rows.map((r) => r.id)

    const [memberRows, projectRows] = await Promise.all([
      db
        .select({ workspaceId: workspaceMembers.workspaceId, count: sql<number>`count(*)::int` })
        .from(workspaceMembers)
        .where(inArray(workspaceMembers.workspaceId, ids))
        .groupBy(workspaceMembers.workspaceId),
      db
        .select({ workspaceId: projects.workspaceId, count: sql<number>`count(*)::int` })
        .from(projects)
        .where(inArray(projects.workspaceId, ids))
        .groupBy(projects.workspaceId),
    ])

    const memberCountByWs = new Map(memberRows.map((r) => [r.workspaceId, r.count]))
    const projectCountByWs = new Map(
      projectRows.filter((r) => r.workspaceId !== null).map((r) => [r.workspaceId!, r.count]),
    )

    return rows.map((r) => ({
      ...r,
      memberCount: memberCountByWs.get(r.id) ?? 0,
      projectCount: projectCountByWs.get(r.id) ?? 0,
    }))
  }
}

function applyUserOrder<T extends { id: string }>(rows: T[], order: string[]): T[] {
  if (order.length === 0) return rows
  const byId = new Map(rows.map((r) => [r.id, r] as const))
  const ordered: T[] = []
  for (const id of order) {
    const row = byId.get(id)
    if (row) {
      ordered.push(row)
      byId.delete(id)
    }
  }
  return [...ordered, ...byId.values()]
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
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
import type { ProjectResponse } from "../project/project.types"
import type { UserRecord } from "../user/user.service"
import type {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponse,
} from "./workspace.types"

const workspaceBaseFields = {
  id: workspaces.id,
  tenantId: workspaces.tenantId,
  name: workspaces.name,
  description: workspaces.description,
  createdAt: workspaces.createdAt,
  updatedAt: workspaces.updatedAt,
}

type WorkspaceBaseRow = {
  id: string
  tenantId: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

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
   * Returns every workspace in the tenant — for the admin-overview settings
   * page. Caller must have can_manage_workspaces (enforced at controller).
   */
  async findAllForAdmin(tenantId: string): Promise<WorkspaceResponse[]> {
    const rows = await db
      .select(workspaceBaseFields)
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId))
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
    if (!canManageWorkspaces && !(await this.isMember(workspaceId, userId))) {
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
        name,
        description: dto.description ?? null,
      })
      await tx.insert(workspaceMembers).values({ workspaceId: id, userId: creatorUserId })
    })

    return {
      id,
      tenantId,
      name,
      description: dto.description ?? null,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
      projectCount: 0,
    }
  }

  async update(
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    tenantId: string,
  ): Promise<WorkspaceResponse> {
    const updates: Partial<typeof workspaces.$inferInsert> = {}
    if (dto.name !== undefined) {
      const name = dto.name.trim()
      if (!name) throw new BadRequestException("name cannot be empty")
      updates.name = name
    }
    if (dto.description !== undefined) updates.description = dto.description

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()

      const result = await db
        .update(workspaces)
        .set(updates)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
        .returning({ id: workspaces.id })

      if (result.length === 0) {
        throw new NotFoundException(`Workspace ${workspaceId} not found`)
      }
    }

    const base = await this.findOneBase(workspaceId, tenantId)
    const [withCounts] = await this.attachCounts([base])
    return withCounts
  }

  async remove(workspaceId: string, tenantId: string): Promise<void> {
    const result = await db
      .delete(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
      .returning({ id: workspaces.id })
    if (result.length === 0) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`)
    }
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
    const [[ws], [u]] = await Promise.all([
      db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId))),
      db.select({ id: users.id }).from(users).where(eq(users.id, userId)),
    ])
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`)
    if (!u) throw new NotFoundException(`User ${userId} not found`)

    await db
      .insert(workspaceMembers)
      .values({ workspaceId, userId })
      .onConflictDoNothing()
  }

  async removeMember(workspaceId: string, userId: string, tenantId: string): Promise<void> {
    const [ws] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
    if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`)

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

  /**
   * Idempotent project assign. `workspaceId: null` = unassign (admin-only).
   * Non-null target needs either manage OR (move-between perm AND target membership).
   */
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

    if (workspaceId !== null) {
      if (!canManageWorkspaces && !canMoveProjectsBetweenWorkspaces) {
        throw new ForbiddenException(
          `Missing permission: ${Perms.moveProjectsBetweenWorkspaces}`,
        )
      }

      if (!canManageWorkspaces && !(await this.isMember(workspaceId, userId))) {
        throw new NotFoundException(`Workspace ${workspaceId} not found`)
      }

      const [ws] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)))
      if (!ws) throw new NotFoundException(`Workspace ${workspaceId} not found`)
    }

    const project = await this.projectService.findOneForUser({
      projectId,
      tenantId,
      userId,
      canManageWorkspaces,
    })

    const now = new Date()
    await db
      .update(projects)
      .set({ workspaceId, updatedAt: now })
      .where(and(eq(projects.id, project.id), eq(projects.tenantId, tenantId)))

    return { ...project, workspaceId, updatedAt: now }
  }

  async createProjectInWorkspace(params: {
    workspaceId: string
    tenantId: string
    userId: string
    canManageWorkspaces: boolean
    dto?: { title?: string; description?: string }
  }): Promise<ProjectResponse> {
    const { workspaceId, tenantId, userId, canManageWorkspaces, dto } = params

    await this.findOne({ workspaceId, userId, tenantId, canManageWorkspaces })

    const project = await this.projectService.create(dto, tenantId)
    const now = new Date()
    await db
      .update(projects)
      .set({ workspaceId, updatedAt: now })
      .where(and(eq(projects.id, project.id), eq(projects.tenantId, tenantId)))

    return { ...project, workspaceId, updatedAt: now }
  }

  /**
   * Member + project counts computed via two grouped queries instead of
   * correlated subqueries in the main SELECT — avoids Drizzle subquery
   * correlation oddities and surfaces each row count explicitly.
   */
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

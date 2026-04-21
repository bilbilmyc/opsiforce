import { Injectable, Logger, NotFoundException } from "@nestjs/common"
import { eq, sql } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { users, userTenants, userWorkspacePreferences } from "../../db/schema"

export interface UserIdentity {
  keycloakId: string
  email?: string
  displayName?: string
}

export interface UserRecord {
  id: string
  keycloakId: string
  email: string | null
  displayName: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WorkspacePreferencesResponse {
  workspaceOrder: string[]
  updatedAt: Date | null
}

export interface UpdateWorkspacePreferencesDto {
  workspaceOrder?: string[]
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)
  private readonly pendingUsers = new Map<string, Promise<UserRecord>>()

  async getOrCreateUser(identity: UserIdentity, tenantId?: string): Promise<UserRecord> {
    const cacheKey = tenantId ? `${identity.keycloakId}:${tenantId}` : identity.keycloakId
    const pending = this.pendingUsers.get(cacheKey)
    if (pending) return pending

    const promise = this.doGetOrCreateUser(identity, tenantId)
      .finally(() => this.pendingUsers.delete(cacheKey))
    this.pendingUsers.set(cacheKey, promise)
    return promise
  }

  private async doGetOrCreateUser(identity: UserIdentity, tenantId?: string): Promise<UserRecord> {
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.keycloakId, identity.keycloakId))

    if (existing) {
      const newEmail = identity.email ?? null
      const newDisplayName = identity.displayName ?? null
      if (existing.email !== newEmail || existing.displayName !== newDisplayName) {
        await db
          .update(users)
          .set({ email: newEmail, displayName: newDisplayName, updatedAt: new Date() })
          .where(eq(users.keycloakId, identity.keycloakId))
      }
      if (tenantId) await this.ensureUserTenant(existing.id, tenantId)
      return { ...existing, email: newEmail ?? existing.email, displayName: newDisplayName ?? existing.displayName }
    }

    const [created] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        keycloakId: identity.keycloakId,
        email: identity.email ?? null,
        displayName: identity.displayName ?? null,
      })
      .onConflictDoNothing()
      .returning()

    const user = created ?? (await db.select().from(users).where(eq(users.keycloakId, identity.keycloakId)))[0]

    if (tenantId) await this.ensureUserTenant(user.id, tenantId)

    if (created) this.logger.log(`Created user ${user.email ?? user.keycloakId}`)
    return user
  }

  private async ensureUserTenant(userId: string, tenantId: string): Promise<void> {
    await db
      .insert(userTenants)
      .values({ userId, tenantId })
      .onConflictDoNothing()
  }

  async listByTenant(tenantId: string): Promise<UserRecord[]> {
    const rows = await db
      .select()
      .from(users)
      .innerJoin(userTenants, eq(userTenants.userId, users.id))
      .where(eq(userTenants.tenantId, tenantId))
      .orderBy(users.displayName)
    return rows.map((r) => r.users)
  }

  async findById(id: string): Promise<UserRecord> {
    const [row] = await db.select().from(users).where(eq(users.id, id))
    if (!row) throw new NotFoundException(`User ${id} not found`)
    return row
  }

  async findByKeycloakId(keycloakId: string): Promise<UserRecord | null> {
    const [row] = await db.select().from(users).where(eq(users.keycloakId, keycloakId))
    return row ?? null
  }

  async getWorkspacePreferences(userId: string): Promise<WorkspacePreferencesResponse> {
    const [row] = await db
      .select()
      .from(userWorkspacePreferences)
      .where(eq(userWorkspacePreferences.userId, userId))
    if (!row) return { workspaceOrder: [], updatedAt: null }
    return { workspaceOrder: row.workspaceOrder, updatedAt: row.updatedAt }
  }

  async updateWorkspacePreferences(
    userId: string,
    dto: UpdateWorkspacePreferencesDto,
  ): Promise<WorkspacePreferencesResponse> {
    const now = new Date()
    const workspaceOrder = Array.isArray(dto.workspaceOrder) ? dto.workspaceOrder : []

    await db
      .insert(userWorkspacePreferences)
      .values({ userId, workspaceOrder, updatedAt: now })
      .onConflictDoUpdate({
        target: userWorkspacePreferences.userId,
        set: {
          workspaceOrder:
            dto.workspaceOrder !== undefined
              ? workspaceOrder
              : sql`${userWorkspacePreferences.workspaceOrder}`,
          updatedAt: now,
        },
      })

    return this.getWorkspacePreferences(userId)
  }
}

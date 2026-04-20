import { Injectable, Logger, NotFoundException } from "@nestjs/common"
import { eq, sql } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { users, userWorkspacePreferences } from "../../db/schema"

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

  async getOrCreateUser(identity: UserIdentity): Promise<UserRecord> {
    const pending = this.pendingUsers.get(identity.keycloakId)
    if (pending) return pending

    const promise = this.doGetOrCreateUser(identity)
      .finally(() => this.pendingUsers.delete(identity.keycloakId))
    this.pendingUsers.set(identity.keycloakId, promise)
    return promise
  }

  private async doGetOrCreateUser(identity: UserIdentity): Promise<UserRecord> {
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

    this.logger.log(`Created user ${user.email ?? user.keycloakId}`)
    return user
  }

  
  async listAll(): Promise<UserRecord[]> {
    return db.select().from(users).orderBy(users.displayName)
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

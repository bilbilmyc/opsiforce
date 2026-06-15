import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../db';
import { users, userTenants, userWorkspacePreferences } from '../../db/schema';
import { WorkspaceService } from '../workspace/workspace.service';

export interface UserIdentity {
  keycloakId: string;
  email?: string;
  displayName?: string;
}

export interface UserRecord {
  id: string;
  keycloakId: string;
  email: string | null;
  displayName: string | null;
  lastAccessTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspacePreferencesResponse {
  workspaceOrder: string[];
  updatedAt: Date | null;
}

export interface UpdateWorkspacePreferencesDto {
  workspaceOrder?: string[];
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly pendingUsers = new Map<string, Promise<UserRecord>>();

  constructor(
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {}

  async getOrCreateUser(identity: UserIdentity, tenantId?: string): Promise<UserRecord> {
    const cacheKey = tenantId ? `${identity.keycloakId}:${tenantId}` : identity.keycloakId;
    const pending = this.pendingUsers.get(cacheKey);
    if (pending) return pending;

    const promise = this.doGetOrCreateUser(identity, tenantId).finally(() => this.pendingUsers.delete(cacheKey));
    this.pendingUsers.set(cacheKey, promise);
    return promise;
  }

  private async doGetOrCreateUser(identity: UserIdentity, tenantId?: string): Promise<UserRecord> {
    const [existing] = await db.select().from(users).where(eq(users.keycloakId, identity.keycloakId));

    if (existing) {
      const newEmail = identity.email ?? null;
      const newDisplayName = identity.displayName ?? null;
      const profileChanged = existing.email !== newEmail || existing.displayName !== newDisplayName;
      const now = new Date();
      await db
        .update(users)
        .set(
          profileChanged
            ? { email: newEmail, displayName: newDisplayName, lastAccessTime: now, updatedAt: now }
            : { lastAccessTime: now }
        )
        .where(eq(users.keycloakId, identity.keycloakId));
      if (tenantId) {
        await this.ensureUserTenant(existing.id, tenantId);
        await this.workspaceService.ensurePrivateWorkspace(existing.id, tenantId);
      }
      return {
        ...existing,
        email: newEmail ?? existing.email,
        displayName: newDisplayName ?? existing.displayName,
        lastAccessTime: now,
      };
    }

    const [created] = await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        keycloakId: identity.keycloakId,
        email: identity.email ?? null,
        displayName: identity.displayName ?? null,
        lastAccessTime: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    const user = created ?? (await db.select().from(users).where(eq(users.keycloakId, identity.keycloakId)))[0];

    if (tenantId) {
      await this.ensureUserTenant(user.id, tenantId);
      await this.workspaceService.ensurePrivateWorkspace(user.id, tenantId);
    }

    if (created) this.logger.log(`Created user ${user.email ?? user.keycloakId}`);
    return user;
  }

  private async ensureUserTenant(userId: string, tenantId: string): Promise<void> {
    await db.insert(userTenants).values({ userId, tenantId }).onConflictDoNothing();
  }

  async listByTenant(tenantId: string): Promise<UserRecord[]> {
    const rows = await db
      .select()
      .from(users)
      .innerJoin(userTenants, eq(userTenants.userId, users.id))
      .where(eq(userTenants.tenantId, tenantId))
      .orderBy(users.displayName);
    return rows.map((r) => r.users);
  }

  async findById(id: string): Promise<UserRecord> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    if (!row) throw new NotFoundException(`User ${id} not found`);
    return row;
  }

  async findByKeycloakId(keycloakId: string): Promise<UserRecord | null> {
    const [row] = await db.select().from(users).where(eq(users.keycloakId, keycloakId));
    return row ?? null;
  }

  async getLastAccessTimes(keycloakUserIds: string[]): Promise<Record<string, string | null>> {
    if (keycloakUserIds.length === 0) return {};
    const rows = await db
      .select({ keycloakId: users.keycloakId, lastAccessTime: users.lastAccessTime })
      .from(users)
      .where(inArray(users.keycloakId, keycloakUserIds));
    const result: Record<string, string | null> = {};
    rows.forEach((row) => {
      result[row.keycloakId] = row.lastAccessTime ? row.lastAccessTime.toISOString() : null;
    });
    return result;
  }

  async getWorkspacePreferences(userId: string): Promise<WorkspacePreferencesResponse> {
    const [row] = await db.select().from(userWorkspacePreferences).where(eq(userWorkspacePreferences.userId, userId));
    if (!row) return { workspaceOrder: [], updatedAt: null };
    return { workspaceOrder: row.workspaceOrder, updatedAt: row.updatedAt };
  }

  async updateWorkspacePreferences(
    userId: string,
    dto: UpdateWorkspacePreferencesDto
  ): Promise<WorkspacePreferencesResponse> {
    const now = new Date();
    const workspaceOrder = Array.isArray(dto.workspaceOrder) ? dto.workspaceOrder : [];

    await db
      .insert(userWorkspacePreferences)
      .values({ userId, workspaceOrder, updatedAt: now })
      .onConflictDoUpdate({
        target: userWorkspacePreferences.userId,
        set: {
          workspaceOrder:
            dto.workspaceOrder !== undefined ? workspaceOrder : sql`${userWorkspacePreferences.workspaceOrder}`,
          updatedAt: now,
        },
      });

    return this.getWorkspacePreferences(userId);
  }
}

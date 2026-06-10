import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import {
  globalTimeoutDefaults,
  globalBudgetDefaults,
  tenantTimeoutDefaults,
  tenantBudgetDefaults,
} from "../../db/schema"
import { assertPositiveMs } from "../common/validation"
import type {
  TimeoutDefaults,
  BudgetDefaults,
  UpdateTimeoutDefaultsDto,
  UpdateBudgetDefaultsDto,
} from "./defaults.types"

const GLOBAL_ID = "default"

const BUDGET_NUMBER_KEYS = [
  "defaultTenantBudget",
  "defaultProjectBudget",
  "defaultChatBudget",
  "defaultBackendBudget",
] as const satisfies ReadonlyArray<keyof BudgetDefaults>

const BUDGET_DURATION_KEYS = [
  "defaultTenantBudgetDuration",
  "defaultProjectBudgetDuration",
  "defaultChatBudgetDuration",
  "defaultBackendBudgetDuration",
] as const satisfies ReadonlyArray<keyof BudgetDefaults>

@Injectable()
export class DefaultsService {
  async getGlobalTimeouts(): Promise<TimeoutDefaults> {
    const [row] = await db
      .select()
      .from(globalTimeoutDefaults)
      .where(eq(globalTimeoutDefaults.id, GLOBAL_ID))
    if (!row) throw new NotFoundException("Global timeout defaults not initialized")
    return {
      defaultTimeoutIdle: row.defaultTimeoutIdle,
      defaultAppTimeoutIdle: row.defaultAppTimeoutIdle,
    }
  }

  async getGlobalBudgets(): Promise<BudgetDefaults> {
    const [row] = await db
      .select()
      .from(globalBudgetDefaults)
      .where(eq(globalBudgetDefaults.id, GLOBAL_ID))
    if (!row) throw new NotFoundException("Global budget defaults not initialized")
    return pickBudgetFields(row)
  }

  async updateGlobalTimeouts(patch: UpdateTimeoutDefaultsDto): Promise<TimeoutDefaults> {
    const updates = cleanTimeoutPatch(patch)
    if (Object.keys(updates).length > 0) {
      await db
        .update(globalTimeoutDefaults)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(globalTimeoutDefaults.id, GLOBAL_ID))
    }
    return this.getGlobalTimeouts()
  }

  async updateGlobalBudgets(patch: UpdateBudgetDefaultsDto): Promise<BudgetDefaults> {
    const updates = cleanBudgetPatch(patch)
    if (Object.keys(updates).length > 0) {
      await db
        .update(globalBudgetDefaults)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(globalBudgetDefaults.id, GLOBAL_ID))
    }
    return this.getGlobalBudgets()
  }

  async getTenantTimeouts(tenantId: string): Promise<TimeoutDefaults> {
    const [row] = await db
      .select()
      .from(tenantTimeoutDefaults)
      .where(eq(tenantTimeoutDefaults.tenantId, tenantId))
    if (row) {
      return {
        defaultTimeoutIdle: row.defaultTimeoutIdle,
        defaultAppTimeoutIdle: row.defaultAppTimeoutIdle,
      }
    }
    return this.getGlobalTimeouts()
  }

  async getTenantBudgets(tenantId: string): Promise<BudgetDefaults> {
    const [row] = await db
      .select()
      .from(tenantBudgetDefaults)
      .where(eq(tenantBudgetDefaults.tenantId, tenantId))
    if (row) return pickBudgetFields(row)
    return this.getGlobalBudgets()
  }

  async updateTenantTimeouts(tenantId: string, patch: UpdateTimeoutDefaultsDto): Promise<TimeoutDefaults> {
    const updates = cleanTimeoutPatch(patch)
    if (Object.keys(updates).length > 0) {
      await db
        .update(tenantTimeoutDefaults)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(tenantTimeoutDefaults.tenantId, tenantId))
    }
    return this.getTenantTimeouts(tenantId)
  }

  async updateTenantBudgets(tenantId: string, patch: UpdateBudgetDefaultsDto): Promise<BudgetDefaults> {
    const updates = cleanBudgetPatch(patch)
    if (Object.keys(updates).length > 0) {
      await db
        .update(tenantBudgetDefaults)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(tenantBudgetDefaults.tenantId, tenantId))
    }
    return this.getTenantBudgets(tenantId)
  }

  async seedTenantDefaults(tenantId: string): Promise<void> {
    const [globals, budgets] = await Promise.all([
      this.getGlobalTimeouts(),
      this.getGlobalBudgets(),
    ])

    await Promise.all([
      db.insert(tenantTimeoutDefaults).values({ tenantId, ...globals }).onConflictDoNothing(),
      db.insert(tenantBudgetDefaults).values({ tenantId, ...budgets }).onConflictDoNothing(),
    ])
  }
}

function pickBudgetFields(row: BudgetDefaults): BudgetDefaults {
  return {
    defaultTenantBudget: row.defaultTenantBudget,
    defaultTenantBudgetDuration: row.defaultTenantBudgetDuration,
    defaultProjectBudget: row.defaultProjectBudget,
    defaultProjectBudgetDuration: row.defaultProjectBudgetDuration,
    defaultChatBudget: row.defaultChatBudget,
    defaultChatBudgetDuration: row.defaultChatBudgetDuration,
    defaultBackendBudget: row.defaultBackendBudget,
    defaultBackendBudgetDuration: row.defaultBackendBudgetDuration,
  }
}

function cleanTimeoutPatch(patch: UpdateTimeoutDefaultsDto): Partial<TimeoutDefaults> {
  const updates: Partial<TimeoutDefaults> = {}
  if (patch.defaultTimeoutIdle !== undefined) {
    updates.defaultTimeoutIdle = assertPositiveMs(patch.defaultTimeoutIdle, "defaultTimeoutIdle")
  }
  if (patch.defaultAppTimeoutIdle !== undefined) {
    updates.defaultAppTimeoutIdle = assertPositiveMs(patch.defaultAppTimeoutIdle, "defaultAppTimeoutIdle")
  }
  return updates
}

function cleanBudgetPatch(patch: UpdateBudgetDefaultsDto): Partial<BudgetDefaults> {
  const updates: Partial<BudgetDefaults> = {}
  for (const key of BUDGET_NUMBER_KEYS) {
    const val = patch[key]
    if (val === undefined) continue
    if (typeof val !== "number" || val < 0) {
      throw new BadRequestException(`${key} must be a non-negative number`)
    }
    updates[key] = val
  }
  for (const key of BUDGET_DURATION_KEYS) {
    const val = patch[key]
    if (val === undefined) continue
    if (typeof val !== "string" || val.length === 0) {
      throw new BadRequestException(`${key} must be a non-empty string`)
    }
    updates[key] = val
  }
  return updates
}

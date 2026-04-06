import { Injectable } from "@nestjs/common"
import { eq, inArray } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { tenants } from "../../db/schema"

const TENANT_GROUP_PREFIX = "role:opsiforce_tenant_name_"

@Injectable()
export class TenantService {
  parseTenantGroups(groupsHeader: string): string[] {
    return groupsHeader
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.startsWith(TENANT_GROUP_PREFIX))
      .map((g) => g.replace(TENANT_GROUP_PREFIX, ""))
  }

  async getOrCreateTenant(name: string) {
    const [existing] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.name, name))

    if (existing) return existing

    const [created] = await db
      .insert(tenants)
      .values({ id: crypto.randomUUID(), name, displayName: name })
      .onConflictDoNothing()
      .returning()

    return created ?? (await db.select().from(tenants).where(eq(tenants.name, name)))[0]
  }

  async getOrCreateTenants(names: string[]) {
    if (names.length === 0) return []

    const existing = await db
      .select()
      .from(tenants)
      .where(inArray(tenants.name, names))

    const existingNames = new Set(existing.map((t) => t.name))
    const missing = names.filter((n) => !existingNames.has(n))

    if (missing.length > 0) {
      await db
        .insert(tenants)
        .values(missing.map((name) => ({ id: crypto.randomUUID(), name, displayName: name })))
        .onConflictDoNothing()
    }

    if (missing.length === 0) return existing

    return db
      .select()
      .from(tenants)
      .where(inArray(tenants.name, names))
  }
}

import { Injectable, Logger } from "@nestjs/common"
import { eq, inArray } from "drizzle-orm"
import crypto from "crypto"
import { db } from "../../db"
import { tenants } from "../../db/schema"
import { BifrostService } from "../bifrost/bifrost.service"

const TENANT_GROUP_PREFIX = "role:opsiforce_tenant_name_"

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name)
  constructor(private readonly bifrostService: BifrostService) {}

  parseTenantGroups(groupsHeader: string): string[] {
    return groupsHeader
      .split(",")
      .map((g) => g.trim())
      .filter((g) => g.startsWith(TENANT_GROUP_PREFIX))
      .map((g) => g.replace(TENANT_GROUP_PREFIX, ""))
  }

  private async ensureBifrostCustomer(tenant: typeof tenants.$inferSelect) {
    if (!this.bifrostService.isEnabled()) return tenant

    try {
      const customerId = await this.bifrostService.createTenantCustomer(tenant.id, tenant.name)
      return { ...tenant, bifrostTenantId: customerId }
    } catch (err) {
      this.logger.warn(`Failed to create Bifrost customer for tenant ${tenant.name}: ${(err as Error).message}`)
      return tenant
    }
  }

  async getOrCreateTenant(name: string) {
    const [existing] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.name, name))

    if (existing) {
      if (existing.bifrostTenantId) return existing
      return this.ensureBifrostCustomer(existing)
    }

    const [created] = await db
      .insert(tenants)
      .values({ id: crypto.randomUUID(), name, displayName: name })
      .onConflictDoNothing()
      .returning()

    const tenant = created ?? (await db.select().from(tenants).where(eq(tenants.name, name)))[0]
    return this.ensureBifrostCustomer(tenant)
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

    const all = missing.length === 0
      ? existing
      : await db.select().from(tenants).where(inArray(tenants.name, names))

    return Promise.all(all.map((t) => this.ensureBifrostCustomer(t)))
  }
}
